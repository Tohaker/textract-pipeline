import "vitest";
import { CustomMatcher } from "aws-sdk-client-mock-vitest";

declare module "vitest" {
	interface Matchers<R, T> extends CustomMatcher<R, T> {}
}
