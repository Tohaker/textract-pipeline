import {
	BatchProcessor,
	EventType,
	processPartialResponse,
} from "@aws-lambda-powertools/batch";
import { extractDataFromEnvelope } from "@aws-lambda-powertools/jmespath/envelopes";
import { Logger } from "@aws-lambda-powertools/logger";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
	GetDocumentTextDetectionCommand,
	TextractClient,
} from "@aws-sdk/client-textract";
import {
	type ApiAsyncDocumentTextDetection,
	type ApiBlock,
	TextractDocument,
} from "amazon-textract-response-parser";
import type { Context, SQSEvent, SQSRecord } from "aws-lambda";

type ResultsNotification = {
	JobId: string;
	Status: "SUCCEEDED" | "FAILED" | "ERROR";
	API: string;
	JobTag: string;
	Timestap: number;
	DocumentLocation: {
		S3ObjectName: string;
		S3Bucket: string;
	};
};

const textractClient = new TextractClient();
const s3Client = new S3Client();
const processor = new BatchProcessor(EventType.SQS);
const logger = new Logger();

const recordHandler = async (record: SQSRecord) => {
	const payload = extractDataFromEnvelope<ResultsNotification>(
		record,
		"powertools_json(body).powertools_json(Message)",
	);

	let documentTextDetectionResult = await textractClient.send(
		new GetDocumentTextDetectionCommand({
			JobId: payload.JobId,
		}),
	);

	if (payload.Status !== "SUCCEEDED") {
		logger.error("Text detection did not succeed", {
			documentTextDetectionResult,
		});
		return;
	}

	const apiResponsePage =
		documentTextDetectionResult as ApiAsyncDocumentTextDetection;

	while (documentTextDetectionResult.NextToken) {
		logger.info("Processing next token for job", {
			JobId: payload.JobId,
			NextToken: documentTextDetectionResult.NextToken,
		});

		documentTextDetectionResult = await textractClient.send(
			new GetDocumentTextDetectionCommand({
				JobId: payload.JobId,
				NextToken: documentTextDetectionResult.NextToken,
			}),
		);

		if (apiResponsePage.JobStatus === "SUCCEEDED") {
			apiResponsePage.Blocks.push(
				...((documentTextDetectionResult.Blocks as ApiBlock[]) ?? []),
			);
		}
	}

	const document = new TextractDocument(apiResponsePage);

	const contents: string[] = [];

	for (const page of document.iterPages()) {
		for (const line of page.iterLines()) {
			contents.push(line.getText());
		}
	}

	const filename = `${payload.DocumentLocation.S3ObjectName.split(".").slice(0, -1).join(".")}-${payload.JobId}.txt`;

	logger.info(`Found ${contents.length} lines to save to file ${filename}`);

	return s3Client.send(
		new PutObjectCommand({
			Bucket: process.env.OUTPUT_S3_BUCKET,
			Key: filename,
			Body: contents.join("\n"),
		}),
	);
};

export const handler = async (event: SQSEvent, context: Context) =>
	processPartialResponse(event, recordHandler, processor, { context });
