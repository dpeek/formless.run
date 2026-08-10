import * as stylex from "@stylexjs/stylex";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  proportional,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Heading } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { borderVars, colorVars } from "@astryxdesign/core/theme/tokens.stylex";
import { useState } from "react";
import { PresentationHostProvider } from "@dpeek/formless-presentation/host/react";
import {
  createFormlessApplicationShellFixtureHost,
  type FormlessApplicationShellFixtureHost,
} from "./application-shell.tsx";
import { createFormlessApplicationShellFixtures } from "./application-shell.fixtures.ts";
import { FormlessFixtureThemeToggle } from "./fixture-layout.tsx";
import { AstryxSubscribedApplicationShellRenderer } from "./shell.tsx";
import { StateInput } from "./state-input.tsx";

export function FormlessDetailWorkspaceLayout() {
  const [fixture] = useState(createDetailWorkspaceFixtureHost);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(exampleOrders[0].id);
  const [ordersById, setOrdersById] = useState<Record<string, ExampleOrder>>(() =>
    Object.fromEntries(exampleOrders.map((order) => [order.id, order])),
  );
  const selectedOrder = ordersById[selectedOrderId] ?? exampleOrders[0];

  function updateSelectedOrder(field: EditableOrderField, value: string) {
    setOrdersById((current) => ({
      ...current,
      [selectedOrder.id]: { ...selectedOrder, [field]: value },
    }));
  }

  if (fixture.shellReference === null) {
    return null;
  }

  return (
    <PresentationHostProvider host={fixture.host}>
      <AstryxSubscribedApplicationShellRenderer
        shellReference={fixture.shellReference}
        themeControl={<FormlessFixtureThemeToggle />}
        variant="section"
      >
        <HStack
          aria-label="Detail workspace"
          data-formless-astryx-detail-workspace
          height="100%"
          width="100%"
        >
          <VStack gap={0} width={360} xstyle={styles.selectorPane}>
            <List density="balanced" hasDividers>
              {Object.values(ordersById).map((order) => (
                <ListItem
                  description={order.orderCode}
                  isSelected={order.id === selectedOrderId}
                  key={order.id}
                  label={order.customer}
                  onClick={() => setSelectedOrderId(order.id)}
                />
              ))}
            </List>
          </VStack>
          <OrderDetailMock order={selectedOrder} onChange={updateSelectedOrder} />
        </HStack>
      </AstryxSubscribedApplicationShellRenderer>
    </PresentationHostProvider>
  );
}

function OrderDetailMock({
  onChange,
  order,
}: {
  onChange: (field: EditableOrderField, value: string) => void;
  order: ExampleOrder;
}) {
  return (
    <VStack gap={0} minHeight="100%" width="100%" xstyle={styles.detailPane}>
      <VStack gap={4} padding={5} width="100%" xstyle={styles.detailContent}>
        <Heading level={3}>Order details</Heading>
        <TextInput
          disabledMessage="Order IDs are generated and cannot be edited."
          isDisabled
          label="Order ID"
          value={order.orderCode}
          width="100%"
        />
        <StateInput
          label="Status"
          option={orderStateOptions[order.status]}
          transitions={transitionsForOrderState(order.status)}
          value={order.status}
          valueStatus={{ kind: "declared", value: order.status }}
          onTransition={(transition) => onChange("status", transition.targetValue)}
        />
        <TextInput
          label="Customer name"
          value={order.customer}
          width="100%"
          onChange={(value) => onChange("customer", value)}
        />
        <TextInput
          label="Customer email"
          value={order.customerEmail}
          width="100%"
          onChange={(value) => onChange("customerEmail", value)}
        />
        <TextInput
          label="Vendor"
          value={order.vendor}
          width="100%"
          onChange={(value) => onChange("vendor", value)}
        />
        <TextInput
          label="Tracking ID"
          value={order.trackingId}
          width="100%"
          onChange={(value) => onChange("trackingId", value)}
        />
        <TextInput
          label="Tracking carrier"
          value={order.trackingCarrier}
          width="100%"
          onChange={(value) => onChange("trackingCarrier", value)}
        />
        <TextArea
          label="Internal notes"
          rows={4}
          value={order.internalNotes}
          width="100%"
          onChange={(value) => onChange("internalNotes", value)}
        />
        <VStack gap={3} paddingBlock={3} xstyle={styles.detailSection}>
          <HStack align="center" gap={3} justify="between" width="100%">
            <Heading level={3}>Compounds</Heading>
            <Button label="Add compound" variant="primary" />
          </HStack>
          <Table<ExampleCompound>
            aria-label="Order compounds"
            columns={compoundTableColumns}
            density="balanced"
            dividers="none"
          >
            <TableHeader>
              <TableRow isHeaderRow>
                {compoundTableColumns.map((column) => (
                  <TableHeaderCell key={column.key} scope="col">
                    {column.header}
                  </TableHeaderCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {exampleCompounds.map((compound) => (
                <TableRow key={compound.testCode}>
                  <TableCell>{compound.testCode}</TableCell>
                  <TableCell>{compound.compoundName}</TableCell>
                  <TableCell>{compound.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </VStack>
      </VStack>
    </VStack>
  );
}

const exampleOrders = [
  {
    id: "order:lh3bjmv5",
    customer: "Patrick Lee",
    customerEmail: "patrick.lee@example.com",
    internalNotes: "Samples received at Verifi. Confirm test plan before allocating assays.",
    orderCode: "LH3BJMV5",
    status: "received_at_verifi",
    trackingCarrier: "DHL",
    trackingId: "JD0146000034912471",
    vendor: "Aster Biologics",
  },
  {
    id: "order:yk4nq83s",
    customer: "Aster Biologics",
    customerEmail: "orders@asterbiologics.com",
    internalNotes: "Awaiting samples.",
    orderCode: "YK4NQ83S",
    status: "awaiting_samples",
    trackingCarrier: "",
    trackingId: "",
    vendor: "Aster Biologics",
  },
  {
    id: "order:zc7hp2kt",
    customer: "Carla Nguyen",
    customerEmail: "carla.nguyen@example.com",
    internalNotes: "Quote sent for approval.",
    orderCode: "ZC7HP2KT",
    status: "quoting",
    trackingCarrier: "",
    trackingId: "",
    vendor: "Northstar Therapeutics",
  },
  {
    id: "order:mw8d6jrp",
    customer: "Northstar Therapeutics",
    customerEmail: "operations@northstar.example.com",
    internalNotes: "Testing is underway.",
    orderCode: "MW8D6JRP",
    status: "partially_complete",
    trackingCarrier: "FedEx",
    trackingId: "772916684111",
    vendor: "Northstar Therapeutics",
  },
  {
    id: "order:sh6rf4bn",
    customer: "Nambu Labs",
    customerEmail: "lab@nambu.example.com",
    internalNotes: "Completed and archived.",
    orderCode: "SH6RF4BN",
    status: "complete",
    trackingCarrier: "",
    trackingId: "",
    vendor: "Nambu Labs",
  },
] as const;

type ExampleOrder = (typeof exampleOrders)[number];
type EditableOrderField = Exclude<keyof ExampleOrder, "id" | "orderCode">;

type ExampleOrderStatus =
  | "quoting"
  | "awaiting_payment"
  | "paid"
  | "awaiting_samples"
  | "received_at_verifi"
  | "partially_complete"
  | "complete"
  | "cancelled";

const orderStateOptions: Record<
  ExampleOrderStatus,
  { colorIntent?: "success" | "warning"; label: string }
> = {
  quoting: { colorIntent: "warning", label: "Quoting" },
  awaiting_payment: { colorIntent: "warning", label: "Awaiting payment" },
  paid: { label: "Paid" },
  awaiting_samples: { colorIntent: "warning", label: "Awaiting samples" },
  received_at_verifi: { label: "Received at Verifi" },
  partially_complete: { label: "Partially complete" },
  complete: { colorIntent: "success", label: "Complete" },
  cancelled: { label: "Cancelled" },
};

type OrderLifecycleTransition = {
  from: readonly ExampleOrderStatus[];
  id: string;
  label: string;
  targetValue: ExampleOrderStatus;
};

const orderLifecycleTransitions: readonly OrderLifecycleTransition[] = [
  { from: ["quoting"], id: "sendQuote", label: "Send quote", targetValue: "awaiting_payment" },
  { from: ["awaiting_payment"], id: "markPaid", label: "Mark paid", targetValue: "paid" },
  {
    from: ["paid"],
    id: "requestSamples",
    label: "Request samples",
    targetValue: "awaiting_samples",
  },
  {
    from: ["awaiting_samples"],
    id: "receiveSamples",
    label: "Receive at Verifi",
    targetValue: "received_at_verifi",
  },
  {
    from: ["quoting", "awaiting_payment", "paid", "awaiting_samples", "received_at_verifi"],
    id: "markPartiallyComplete",
    label: "Mark partially complete",
    targetValue: "partially_complete",
  },
  {
    from: [
      "quoting",
      "awaiting_payment",
      "paid",
      "awaiting_samples",
      "received_at_verifi",
      "partially_complete",
    ],
    id: "complete",
    label: "Complete",
    targetValue: "complete",
  },
  {
    from: [
      "quoting",
      "awaiting_payment",
      "paid",
      "awaiting_samples",
      "received_at_verifi",
      "partially_complete",
    ],
    id: "cancel",
    label: "Cancel",
    targetValue: "cancelled",
  },
];

function transitionsForOrderState(status: ExampleOrderStatus) {
  return orderLifecycleTransitions
    .filter((transition) => transition.from.includes(status))
    .map((transition) => ({ ...transition, operationKey: transition.id }));
}

type ExampleCompound = {
  compoundName: string;
  status: string;
  testCode: string;
};

const compoundTableColumns: TableColumn<ExampleCompound>[] = [
  { header: "Test code", key: "testCode", width: proportional(1) },
  { header: "Compound", key: "compoundName", width: proportional(2) },
  { header: "Status", key: "status", width: proportional(1) },
];

const exampleCompounds: readonly ExampleCompound[] = [
  { compoundName: "AAV8", status: "In testing", testCode: "CMPD-001" },
  { compoundName: "Lentivirus", status: "Awaiting sample", testCode: "CMPD-002" },
];

const styles = stylex.create({
  detailContent: {
    maxWidth: 720,
  },
  detailPane: {
    overflowY: "auto",
  },
  detailSection: {
    borderBlockStartColor: colorVars["--color-border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: borderVars["--border-width"],
  },
  selectorPane: {
    borderInlineEndColor: colorVars["--color-border"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: borderVars["--border-width"],
    flexShrink: 0,
    overflowY: "auto",
  },
});

function createDetailWorkspaceFixtureHost(): FormlessApplicationShellFixtureHost {
  const fixture = createFormlessApplicationShellFixtures().find(
    (candidate) => candidate.id === "program-workspaces",
  );

  if (!fixture) {
    throw new Error("Missing program workspaces shell fixture.");
  }

  return createFormlessApplicationShellFixtureHost(fixture);
}
