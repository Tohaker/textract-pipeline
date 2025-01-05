import path from "node:path";

import { Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import {
	Effect,
	PolicyStatement,
	Role,
	ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import {
	S3EventSourceV2,
	SqsEventSource,
} from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

export class TextractStack extends Stack {
	constructor(scope: Construct, id: string, props?: StackProps) {
		super(scope, id, props);

		//------------------S3 Buckets--------------------//

		const inputBucket = new Bucket(this, "InputBucket", {
			bucketName: `textract-input-${this.account}`,
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		const outputBucket = new Bucket(this, "OutputBucket", {
			bucketName: `textract-output-${this.account}`,
			removalPolicy: RemovalPolicy.DESTROY,
			autoDeleteObjects: true,
		});

		//----------------SNS Topic----------------------//

		const jobCompletionTopic = new Topic(this, "TextractJobCompletionTopic", {
			topicName: "AmazonTextractNotificationTopic",
		});

		//------------------IAM Roles-------------------//

		const textractServiceRole = new Role(this, "TextractServiceRole", {
			assumedBy: new ServicePrincipal("textract.amazonaws.com"),
		});

		textractServiceRole.addToPolicy(
			new PolicyStatement({
				effect: Effect.ALLOW,
				resources: [jobCompletionTopic.topicArn],
				actions: ["sns:Publish"],
			}),
		);

		//----------------SQS Queue----------------------//

		const jobCompletionDLQ = new Queue(this, "TextractJobCompletionDLQ", {
			queueName: "textract-job-completion-dlq",
			retentionPeriod: Duration.days(7),
		});

		const jobCompletionQueue = new Queue(this, "TextractJobCompletionQueue", {
			queueName: "textract-job-completion",
			visibilityTimeout: Duration.seconds(60),
			deadLetterQueue: {
				queue: jobCompletionDLQ,
				maxReceiveCount: 3,
			},
		});

		jobCompletionTopic.addSubscription(new SqsSubscription(jobCompletionQueue));

		//------------------Lambdas---------------------//

		const textractInitiatorFunctionName = "textract-initiator";

		const textractInitiator = new NodejsFunction(this, "TextractInitiator", {
			functionName: textractInitiatorFunctionName,
			runtime: Runtime.NODEJS_22_X,
			architecture: Architecture.ARM_64,
			entry: path.resolve(
				import.meta.dirname,
				"../functions/textractInitiator/handler.ts",
			),
			handler: "index.handler",
			events: [
				new S3EventSourceV2(inputBucket, {
					events: [EventType.OBJECT_CREATED],
				}),
			],
			environment: {
				SNS_TOPIC_ARN: jobCompletionTopic.topicArn,
				ROLE_ARN: textractServiceRole.roleArn,
				POWERTOOLS_SERVICE_NAME: textractInitiatorFunctionName,
			},
		});

		inputBucket.grantRead(textractInitiator);
		textractInitiator.addToRolePolicy(
			new PolicyStatement({
				actions: ["textract:StartDocumentTextDetection"],
				resources: ["*"],
				effect: Effect.ALLOW,
			}),
		);

		const documentProcessorFunctionName = "document-processor";

		const documentProcessor = new NodejsFunction(this, "DocumentProcessor", {
			functionName: documentProcessorFunctionName,
			runtime: Runtime.NODEJS_22_X,
			architecture: Architecture.ARM_64,
			entry: path.resolve(
				import.meta.dirname,
				"../functions/documentProcessor/handler.ts",
			),
			handler: "index.handler",
			events: [new SqsEventSource(jobCompletionQueue)],
			environment: {
				OUTPUT_S3_BUCKET: outputBucket.bucketName,
				POWERTOOLS_SERVICE_NAME: documentProcessorFunctionName,
			},
			timeout: Duration.seconds(60),
		});

		documentProcessor.addToRolePolicy(
			new PolicyStatement({
				actions: ["textract:*"],
				resources: ["*"],
			}),
		);
		outputBucket.grantWrite(documentProcessor);
	}
}
