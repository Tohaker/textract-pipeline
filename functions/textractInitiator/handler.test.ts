import {
	StartDocumentTextDetectionCommand,
	TextractClient,
} from "@aws-sdk/client-textract";
import type { S3Event } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { handler } from "./handler.js";

const textractMock = mockClient(TextractClient);

describe("handler", () => {
	beforeEach(() => {
		textractMock.reset();

		vi.stubEnv("SNS_TOPIC_ARN", "topic-arn");
		vi.stubEnv("ROLE_ARN", "role-arn");
	});

	it("should send text detection commands for each S3 record", async () => {
		const mockEvent = {
			Records: [
				{
					s3: {
						bucket: {
							name: "s3-bucket",
						},
						object: {
							key: "object1",
						},
					},
				},
				{
					s3: {
						bucket: {
							name: "s3-bucket",
						},
						object: {
							key: "object2",
						},
					},
				},
			],
		} as S3Event;

		await handler(mockEvent);

		expect(textractMock).toHaveReceivedCommandTimes(
			StartDocumentTextDetectionCommand,
			2,
		);
		expect(textractMock).toHaveReceivedCommandWith(
			StartDocumentTextDetectionCommand,
			{
				DocumentLocation: {
					S3Object: {
						Bucket: "s3-bucket",
						Name: "object1",
					},
				},
				NotificationChannel: {
					SNSTopicArn: "topic-arn",
					RoleArn: "role-arn",
				},
			},
		);
		expect(textractMock).toHaveReceivedCommandWith(
			StartDocumentTextDetectionCommand,
			{
				DocumentLocation: {
					S3Object: {
						Bucket: "s3-bucket",
						Name: "object2",
					},
				},
				NotificationChannel: {
					SNSTopicArn: "topic-arn",
					RoleArn: "role-arn",
				},
			},
		);
	});
});
