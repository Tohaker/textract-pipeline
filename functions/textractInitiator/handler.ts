import { Logger } from "@aws-lambda-powertools/logger";
import {
	StartDocumentTextDetectionCommand,
	TextractClient,
} from "@aws-sdk/client-textract";
import type { S3Event } from "aws-lambda";

const textractClient = new TextractClient();
const logger = new Logger();

export const handler = async (event: S3Event) => {
	for (const record of event.Records) {
		const startDocumentTextDetectionCommand =
			new StartDocumentTextDetectionCommand({
				DocumentLocation: {
					S3Object: {
						Bucket: record.s3.bucket.name,
						Name: record.s3.object.key,
					},
				},
				NotificationChannel: {
					SNSTopicArn: process.env.SNS_TOPIC_ARN,
					RoleArn: process.env.ROLE_ARN,
				},
			});

		const response = await textractClient.send(
			startDocumentTextDetectionCommand,
		);

		logger.info("Sent text detection command successfully", {
			response,
		});
	}
};
