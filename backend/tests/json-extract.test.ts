import { describe, expect, test } from "bun:test";
import { extractJson } from "../src/utils/json-extract";

describe("extractJson", () => {
  test("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  test("extracts JSON from surrounding prose", () => {
    const text = 'Sure! Here is the result:\n{"branch":"CSE","rows":[{"day":"Monday"}]}\nHope that helps.';
    expect(extractJson(text)).toEqual({ branch: "CSE", rows: [{ day: "Monday" }] });
  });

  test("recovers from unbalanced trailing content", () => {
    expect(extractJson('{"a":{"b":[1,2]}} trailing')).toEqual({ a: { b: [1, 2] } });
  });

  test("handles arrays", () => {
    expect(extractJson("Here are items: [1, 2, 3] done")).toEqual([1, 2, 3]);
  });

  test("returns null on garbage", () => {
    expect(extractJson("no json here at all")).toBeNull();
  });

  test("handles unclosed trailing braces by returning the first balanced block", () => {
    // a genuinely unclosed object (no closing brace at all) is unrecoverable
    expect(extractJson('{"a":1,"b":2')).toBeNull();
    // but trailing content after a closed object is fine
    expect(extractJson('{"a":1} then more')).toEqual({ a: 1 });
    expect(extractJson('{"a":1} trailing {"b":2}')).toEqual({ a: 1 });
  });
});

describe("extractJsonLoose", () => {
  test("extractJson is the single recovery path", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('{"a":1} trailing')).toEqual({ a: 1 });
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });
});
