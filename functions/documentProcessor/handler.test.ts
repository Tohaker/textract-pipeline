import { mockClient } from "aws-sdk-client-mock";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	GetDocumentTextDetectionCommand,
	TextractClient,
} from "@aws-sdk/client-textract";

import { ApiBlockType } from "amazon-textract-response-parser";
import type { Context, SQSRecord } from "aws-lambda";
import { handler } from "./handler.js";

const context = {} as Context;

const mockFailureRecord = {
	messageId: "1",
	body: JSON.stringify({
		Message: JSON.stringify({
			JobId: "123",
			Status: "FAILURE",
		}),
	}),
} as SQSRecord;
const mockSuccessRecord = {
	messageId: "1",
	body: JSON.stringify({
		Message: JSON.stringify({
			JobId: "123",
			Status: "SUCCEEDED",
			DocumentLocation: {
				S3ObjectName: "test.pdf",
			},
		}),
	}),
} as SQSRecord;

describe("handler", () => {
	const textractMock = mockClient(TextractClient);
	const s3Mock = mockClient(S3Client);

	beforeEach(() => {
		vi.stubEnv("OUTPUT_S3_BUCKET", "output-bucket");

		textractMock.reset();
		s3Mock.reset();
	});

	it("should not save a document if the status is not SUCCEEDED", async () => {
		textractMock.on(GetDocumentTextDetectionCommand).resolves({});

		await handler(
			{
				Records: [mockFailureRecord],
			},
			context,
		);

		expect(s3Mock).not.toHaveReceivedCommand(PutObjectCommand);
	});

	it("should save a document if the status is SUCCEEDED", async () => {
		textractMock.on(GetDocumentTextDetectionCommand).resolves({
			Blocks: [
				{
					BlockType: ApiBlockType.Page,
					Geometry: {
						BoundingBox: {
							Height: 1,
							Left: 1,
							Top: 1,
							Width: 1,
						},
						Polygon: [],
					},
				},
			],
		});

		await handler(
			{
				Records: [mockSuccessRecord],
			},
			context,
		);

		expect(s3Mock).toHaveReceivedCommandWith(PutObjectCommand, {
			Bucket: "output-bucket",
			Key: "test-123.txt",
			Body: expect.any(String),
		});
	});
});
