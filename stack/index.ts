#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { TextractStack } from "./TextractStack.js";

const app = new cdk.App();
new TextractStack(app, "TextractStack", {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: process.env.CDK_DEFAULT_REGION,
	},
});
