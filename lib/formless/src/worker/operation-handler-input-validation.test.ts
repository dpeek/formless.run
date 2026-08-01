import { describe, expect, it } from "vite-plus/test";
import { validateOperationHandlerInputValues } from "./operation-handler-input-validation.ts";

describe("operation handler input validation", () => {
  it("validates string record ids and duplicate id rejection from handler capability facts", () => {
    expect(
      validateOperationHandlerInputValues({
        canonicalOperationKey: "rate.addSelectedRate",
        handler: "create-selected-join-record",
        input: {
          fromRecordId: "card-1",
          toRecordId: "rate-1",
        },
      }),
    ).toEqual({
      fromRecordId: "card-1",
      toRecordId: "rate-1",
    });

    expect(() =>
      validateOperationHandlerInputValues({
        canonicalOperationKey: "rate.addSelectedRate",
        handler: "create-selected-join-record",
        input: {
          fromRecordId: "",
          toRecordId: "rate-1",
        },
      }),
    ).toThrow('Operation "rate.addSelectedRate" input fromRecordId must be non-empty.');

    expect(() =>
      validateOperationHandlerInputValues({
        canonicalOperationKey: "rate.removeSelectedRates",
        handler: "remove-selected-join-records",
        input: {
          recordIds: ["join-1", "join-1"],
        },
      }),
    ).toThrow('Operation "rate.removeSelectedRates" input recordIds must not contain duplicates.');
  });

  it("validates scalar record-value map handler fields without record field checks", () => {
    expect(
      validateOperationHandlerInputValues({
        canonicalOperationKey: "block-placement.addTreeChild",
        handler: "create-tree-child",
        input: {
          parentRecordId: "page-1",
          childValues: {
            label: "Hero image",
            published: true,
            sort: 1,
          },
          placementValues: {
            slot: "hero",
          },
        },
      }),
    ).toEqual({
      parentRecordId: "page-1",
      childValues: {
        label: "Hero image",
        published: true,
        sort: 1,
      },
      placementValues: {
        slot: "hero",
      },
    });

    expect(() =>
      validateOperationHandlerInputValues({
        canonicalOperationKey: "block-placement.addTreeChild",
        handler: "create-tree-child",
        input: {
          parentRecordId: "page-1",
          childValues: {
            label: { nested: true },
          },
        },
      }),
    ).toThrow(
      'Operation "block-placement.addTreeChild" input childValues must contain scalar field values.',
    );

    expect(() =>
      validateOperationHandlerInputValues({
        canonicalOperationKey: "block-placement.addTreeChild",
        handler: "create-tree-child",
        input: {
          parentRecordId: "page-1",
          childValues: {
            label: "Hero image",
          },
          placementValues: {
            slot: null,
          },
        },
      }),
    ).toThrow(
      'Operation "block-placement.addTreeChild" input placementValues must contain scalar field values.',
    );
  });

  it("keeps subscribe email address validation outside structural text validation", () => {
    expect(
      validateOperationHandlerInputValues({
        canonicalOperationKey: "subscription.subscribe",
        handler: "contact-subscription.subscribe",
        input: {
          email: "not an email address",
        },
      }),
    ).toEqual({
      email: "not an email address",
    });

    expect(() =>
      validateOperationHandlerInputValues({
        canonicalOperationKey: "subscription.subscribe",
        handler: "contact-subscription.subscribe",
        input: {
          email: 42,
        },
      }),
    ).toThrow('Operation "subscription.subscribe" input email must be text.');
  });
});
