import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge, type BadgeVariant } from "@astryxdesign/core/Badge";
import { Banner, type BannerStatus } from "@astryxdesign/core/Banner";
import { Button, type ButtonVariant } from "@astryxdesign/core/Button";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FieldStatus } from "@astryxdesign/core/FieldStatus";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Section } from "@astryxdesign/core/Section";
import { Selector } from "@astryxdesign/core/Selector";
import { Spinner } from "@astryxdesign/core/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  pixel,
  proportional,
  resolveColumnWidths,
  type TableColumn,
} from "@astryxdesign/core/Table";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { useToast, type ToastOptions } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import type {
  AccessActionContract,
  AccessConfirmationContract,
  AccessControlledFieldContract,
  AccessDisplayFactContract,
  AccessEmptyStateContract,
  AccessFeedbackContract,
  AccessIntentHandler,
  AccessInvitationAuthoringContract,
  AccessInvitationContract,
  AccessManifestContract,
  AccessManifestReference,
  AccessMembershipSelectionContract,
  AccessPersonContract,
  AccessPersonRoleAuthoringContract,
  AccessPersonRoleAuthoringReference,
  AccessReadyContract,
  AccessRoleSelectionContract,
  ButtonContract,
} from "@dpeek/formless-presentation/contract";
import {
  useAccessIntentHandler,
  useAccessInvitationAuthoring,
  useAccessManifest,
  useAccessPersonRoleAuthoring,
} from "@dpeek/formless-presentation/host/react";
import { operationIcon } from "./operation-renderer.tsx";

const SEARCHABLE_OPTION_COUNT = 15;

export function AstryxAccessRenderer({
  authoring,
  manifest,
  onIntent,
  personAuthoring,
}: {
  authoring?: AccessInvitationAuthoringContract | undefined;
  manifest: AccessManifestContract;
  onIntent: AccessIntentHandler;
  personAuthoring?: AccessPersonRoleAuthoringContract | undefined;
}) {
  return (
    <AstryxAccessFrame manifest={manifest} onIntent={onIntent}>
      {manifest.state === "ready" ? (
        <AstryxAccessReadyContent
          authoring={authoring}
          manifest={manifest}
          onIntent={onIntent}
          personAuthoring={personAuthoring}
        />
      ) : null}
    </AstryxAccessFrame>
  );
}

export const AstryxSubscribedAccessRenderer = memo(
  function AstryxSubscribedAccessRenderer({
    accessReference,
  }: {
    accessReference: AccessManifestReference;
  }) {
    const manifest = useAccessManifest(accessReference);
    const onIntent = useAccessIntentHandler();

    if (!manifest) {
      return null;
    }

    return (
      <AstryxAccessFrame manifest={manifest} onIntent={onIntent}>
        {manifest.state === "ready" ? (
          <AstryxSubscribedAccessReadyContent manifest={manifest} />
        ) : null}
      </AstryxAccessFrame>
    );
  },
  (previous, next) => previous.accessReference.accessId === next.accessReference.accessId,
);

function AstryxSubscribedAccessReadyContent({ manifest }: { manifest: AccessReadyContract }) {
  const authoring = useAccessInvitationAuthoring(manifest.authoring);
  const onIntent = useAccessIntentHandler();

  return (
    <AstryxAccessReadyContent authoring={authoring} manifest={manifest} onIntent={onIntent}>
      {manifest.personAuthoring ? (
        <AstryxSubscribedAccessPersonRoleAuthoring reference={manifest.personAuthoring} />
      ) : null}
    </AstryxAccessReadyContent>
  );
}

function AstryxSubscribedAccessPersonRoleAuthoring({
  reference,
}: {
  reference: AccessPersonRoleAuthoringReference;
}) {
  const authoring = useAccessPersonRoleAuthoring(reference);
  const onIntent = useAccessIntentHandler();

  return authoring ? (
    <AstryxAccessPersonRoleAuthoring authoring={authoring} onIntent={onIntent} />
  ) : null;
}

function AstryxAccessFrame({
  children,
  manifest,
  onIntent,
}: {
  children?: ReactNode;
  manifest: AccessManifestContract;
  onIntent: AccessIntentHandler;
}) {
  const headingId = `${manifest.id}:heading`;

  return (
    <Section
      aria-labelledby={headingId}
      data-formless-astryx-access={manifest.id}
      data-formless-astryx-access-state={manifest.state}
      padding={0}
      variant="transparent"
      width="100%"
    >
      <VStack gap={6} width="100%">
        <HStack align="center" gap={3} justify="between" width="100%" wrap="wrap">
          <Heading id={headingId} level={1}>
            {manifest.title}
          </Heading>
          {manifest.state === "ready" ? (
            <AstryxAccessAction action={manifest.invite} onIntent={onIntent} />
          ) : null}
        </HStack>
        {manifest.state === "loading" ? (
          <EmptyState
            description={manifest.message}
            headingLevel={2}
            icon={<Spinner aria-label={manifest.message} size="md" />}
            isCompact
            title={manifest.title}
          />
        ) : null}
        {manifest.state === "failed" || manifest.state === "unauthorized" ? (
          <AstryxAccessFeedbackBanner feedback={manifest.feedback} />
        ) : null}
        {children}
      </VStack>
    </Section>
  );
}

function AstryxAccessReadyContent({
  authoring,
  children,
  manifest,
  onIntent,
  personAuthoring,
}: {
  authoring?: AccessInvitationAuthoringContract | undefined;
  children?: ReactNode;
  manifest: AccessReadyContract;
  onIntent: AccessIntentHandler;
  personAuthoring?: AccessPersonRoleAuthoringContract | undefined;
}) {
  return (
    <VStack gap={6} width="100%">
      {manifest.feedback ? <AstryxAccessFeedbackToast feedback={manifest.feedback} /> : null}
      <VStack gap={6} width="100%">
        <AstryxAccessPeople
          accessId={manifest.id}
          emptyState={manifest.peopleEmptyState}
          onIntent={onIntent}
          people={manifest.people}
        />
        <AstryxAccessInvitations
          accessId={manifest.id}
          emptyState={manifest.invitationsEmptyState}
          invitations={manifest.invitations}
          onIntent={onIntent}
        />
      </VStack>
      {authoring ? (
        <AstryxAccessInvitationAuthoring authoring={authoring} onIntent={onIntent} />
      ) : null}
      {personAuthoring ? (
        <AstryxAccessPersonRoleAuthoring authoring={personAuthoring} onIntent={onIntent} />
      ) : null}
      {children}
      {manifest.confirmation ? (
        <AstryxAccessConfirmation confirmation={manifest.confirmation} onIntent={onIntent} />
      ) : null}
    </VStack>
  );
}

type AstryxAccessPersonRow = {
  id: string;
  person: AccessPersonContract;
} & Record<string, unknown>;

function AstryxAccessPeople({
  accessId,
  emptyState,
  onIntent,
  people,
}: {
  accessId: string;
  emptyState?: AccessEmptyStateContract;
  onIntent: AccessIntentHandler;
  people: readonly AccessPersonContract[];
}) {
  const headingId = `${accessId}:people-heading`;
  const rows = people.map((person) => ({ id: person.id, person }));
  const columns: TableColumn<AstryxAccessPersonRow>[] = [
    {
      header: "Person",
      key: "person",
      renderCell: ({ person }) => (
        <VStack gap={0.5}>
          <Text type="body" weight="medium">
            {person.displayName}
          </Text>
          {person.primaryEmail ? (
            <Text color="secondary" type="supporting">
              {person.primaryEmail}
            </Text>
          ) : null}
        </VStack>
      ),
      width: proportional(1, { minWidth: 160 }),
    },
    {
      header: "Roles",
      key: "roles",
      renderCell: ({ person }) => (
        <HStack gap={1} wrap="wrap">
          {person.roles.map((role) => (
            <span data-formless-astryx-access-role={role.id} key={role.id}>
              <Token
                color="default"
                description={role.scope ? `${role.scope.value}: ${role.label}` : role.label}
                endContent={
                  role.scope ? (
                    <HStack align="center" gap={1}>
                      <Divider orientation="vertical" />
                      <Text type="supporting">{role.label}</Text>
                    </HStack>
                  ) : undefined
                }
                label={role.scope?.value ?? role.label}
                size="sm"
              />
            </span>
          ))}
        </HStack>
      ),
      width: proportional(1, { minWidth: 180 }),
    },
    {
      header: "Status",
      key: "status",
      renderCell: ({ person }) => <AstryxAccessFact fact={person.status} />,
      width: pixel(104),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: ({ person }) => (
        <HStack gap={1} wrap="wrap">
          {person.roleAuthoring.availability === "available" ? (
            <AstryxAccessAction action={person.roleAuthoring.action} onIntent={onIntent} />
          ) : person.roleAuthoring.disabledReason ? (
            <FieldStatus
              message={person.roleAuthoring.disabledReason}
              type="warning"
              variant="detached"
            />
          ) : null}
          {person.removal.availability === "available" ? (
            <AstryxAccessAction action={person.removal.action} destructive onIntent={onIntent} />
          ) : (
            <AstryxAccessControl button={person.removal.control} destructive />
          )}
        </HStack>
      ),
      width: proportional(1, { minWidth: 180 }),
    },
  ];

  return (
    <Section aria-labelledby={headingId} padding={0} variant="transparent" width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%">
          <Heading id={headingId} level={2}>
            People
          </Heading>
          <Badge label={people.length} variant="neutral" />
        </HStack>
        {rows.length === 0 && emptyState ? (
          <AstryxAccessEmptyTable columns={columns} emptyState={emptyState} headingId={headingId} />
        ) : (
          <Table<AstryxAccessPersonRow>
            columns={columns}
            data={rows}
            density="balanced"
            dividers="rows"
            idKey="id"
            tableProps={{ "aria-labelledby": headingId }}
            textOverflow="wrap"
            verticalAlign="top"
          />
        )}
      </VStack>
    </Section>
  );
}

type AstryxAccessInvitationRow = {
  id: string;
  invitation: AccessInvitationContract;
} & Record<string, unknown>;

function AstryxAccessInvitations({
  accessId,
  emptyState,
  invitations,
  onIntent,
}: {
  accessId: string;
  emptyState?: AccessEmptyStateContract;
  invitations: readonly AccessInvitationContract[];
  onIntent: AccessIntentHandler;
}) {
  const headingId = `${accessId}:invitations-heading`;
  const rows = invitations.map((invitation) => ({ id: invitation.id, invitation }));
  const columns: TableColumn<AstryxAccessInvitationRow>[] = [
    {
      header: "Invitation",
      key: "invitation",
      renderCell: ({ invitation }) => (
        <VStack gap={0.5}>
          <Text type="body" weight="medium">
            {invitation.targetEmail}
          </Text>
          <Text color="secondary" type="supporting">
            {invitation.target.value}
          </Text>
        </VStack>
      ),
      width: proportional(1, { minWidth: 180 }),
    },
    {
      header: "Scope",
      key: "scope",
      renderCell: ({ invitation }) =>
        invitation.scope ? <AstryxAccessFact fact={invitation.scope} /> : null,
      width: proportional(1, { minWidth: 120 }),
    },
    {
      header: "Inviter",
      key: "inviter",
      renderCell: ({ invitation }) =>
        invitation.inviter ? <AstryxAccessFact fact={invitation.inviter} /> : null,
      width: proportional(1, { minWidth: 120 }),
    },
    {
      header: "Expires",
      key: "expiresAt",
      renderCell: ({ invitation }) => <AstryxAccessFact fact={invitation.expiresAt} />,
      width: proportional(1, { minWidth: 140 }),
    },
    {
      header: "Status",
      key: "status",
      renderCell: ({ invitation }) => <AstryxAccessFact fact={invitation.status} />,
      width: pixel(104),
    },
    {
      header: "Actions",
      key: "actions",
      renderCell: ({ invitation }) =>
        invitation.deletion.availability === "available" ? (
          <AstryxAccessAction action={invitation.deletion.action} destructive onIntent={onIntent} />
        ) : invitation.deletion.disabledReason ? (
          <FieldStatus
            message={invitation.deletion.disabledReason}
            type="warning"
            variant="detached"
          />
        ) : null,
      width: pixel(144),
    },
  ];

  return (
    <Section aria-labelledby={headingId} padding={0} variant="transparent" width="100%">
      <VStack gap={3} width="100%">
        <HStack align="center" gap={2} justify="between" width="100%">
          <Heading id={headingId} level={2}>
            Invitations
          </Heading>
          <Badge label={invitations.length} variant="neutral" />
        </HStack>
        {rows.length === 0 && emptyState ? (
          <AstryxAccessEmptyTable columns={columns} emptyState={emptyState} headingId={headingId} />
        ) : (
          <Table<AstryxAccessInvitationRow>
            columns={columns}
            data={rows}
            density="balanced"
            dividers="rows"
            idKey="id"
            tableProps={{ "aria-labelledby": headingId }}
            textOverflow="wrap"
            verticalAlign="top"
          />
        )}
      </VStack>
    </Section>
  );
}

function AstryxAccessEmptyTable<Row extends Record<string, unknown>>({
  columns,
  emptyState,
  headingId,
}: {
  columns: TableColumn<Row>[];
  emptyState: AccessEmptyStateContract;
  headingId: string;
}) {
  const resolvedWidths = resolveColumnWidths(columns);

  return (
    <Table<Row>
      columns={columns}
      density="balanced"
      dividers="rows"
      tableProps={{ "aria-labelledby": headingId }}
      textOverflow="wrap"
      verticalAlign="top"
    >
      <colgroup>
        {columns.map((column) => (
          <col key={column.key} style={resolvedWidths.columns.get(column.key)?.style} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow isHeaderRow>
          {columns.map((column) => (
            <TableHeaderCell key={column.key} scope="col">
              {column.header}
            </TableHeaderCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow aria-label={emptyState.title}>
          <TableCell colSpan={columns.length}>
            <EmptyState
              data-formless-astryx-access-empty={emptyState.id}
              description={emptyState.description}
              isCompact
              title={emptyState.title}
            />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function AstryxAccessFact({ fact }: { fact: AccessDisplayFactContract }) {
  const data = { "data-formless-astryx-access-fact": fact.id };

  if (fact.presentation === "status") {
    return <Badge {...data} label={fact.value} variant={astryxAccessBadgeVariant(fact.intent)} />;
  }

  if (fact.presentation === "timestamp") {
    return (
      <span {...data}>
        <Timestamp format="date_time" value={fact.value} />
      </span>
    );
  }

  return (
    <Text {...data} color="secondary" type="supporting">
      {fact.value}
    </Text>
  );
}

export function AstryxAccessInvitationAuthoring({
  authoring,
  onIntent,
}: {
  authoring: AccessInvitationAuthoringContract;
  onIntent: AccessIntentHandler;
}) {
  return (
    <Dialog
      aria-label={authoring.title}
      isOpen={authoring.open}
      onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
      purpose="form"
      width={680}
    >
      <AstryxAccessInvitationAuthoringContent authoring={authoring} onIntent={onIntent} />
    </Dialog>
  );
}

export function AstryxAccessInvitationAuthoringContent({
  authoring,
  onIntent,
}: {
  authoring: AccessInvitationAuthoringContract;
  onIntent: AccessIntentHandler;
}) {
  const formId = `${authoring.id}:form`;
  const formErrors = astryxAccessFormErrors(authoring);

  return (
    <Layout
      content={
        <LayoutContent>
          <form
            aria-busy={authoring.pending?.isPending}
            data-formless-astryx-access-authoring={authoring.id}
            id={formId}
            noValidate
            onSubmit={(event) => submitAstryxAccessInvitation(event, authoring, onIntent)}
          >
            <VStack gap={5} width="100%">
              <FormLayout direction="vertical">
                <HStack gap={3} width="100%">
                  <AstryxAccessControlledField
                    field={authoring.fields.targetEmail}
                    onIntent={onIntent}
                    pending={authoring.pending}
                  />
                  <AstryxAccessControlledField
                    field={authoring.fields.displayName}
                    onIntent={onIntent}
                    pending={authoring.pending}
                  />
                </HStack>
                <AstryxAccessRoleSelection
                  onIntent={onIntent}
                  pending={authoring.pending}
                  selection={authoring.roleSelection}
                />
                {authoring.fields.acceptanceTarget ? (
                  <AstryxAccessControlledField
                    field={authoring.fields.acceptanceTarget}
                    onIntent={onIntent}
                    pending={authoring.pending}
                  />
                ) : null}
                <AstryxAccessMembershipSelection
                  onIntent={onIntent}
                  pending={authoring.pending}
                  selection={authoring.membershipSelection}
                />
              </FormLayout>
              {formErrors.length > 0 ? (
                <VStack aria-live="assertive" gap={1} role="alert">
                  {formErrors.map((error) => (
                    <FieldStatus key={error} message={error} type="error" variant="detached" />
                  ))}
                </VStack>
              ) : null}
              {authoring.feedback ? (
                <AstryxAccessFeedbackToast feedback={authoring.feedback} />
              ) : null}
            </VStack>
          </form>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} justify="end" width="100%" wrap="wrap">
            <AstryxAccessAction action={authoring.cancel} onIntent={onIntent} />
            <AstryxAccessAction action={authoring.submit} form={formId} onIntent={onIntent} />
          </HStack>
        </LayoutFooter>
      }
      header={
        <DialogHeader
          onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
          title={authoring.title}
        />
      }
    />
  );
}

function AstryxAccessControlledField({
  field,
  onIntent,
  pending,
}: {
  field: AccessControlledFieldContract;
  onIntent: AccessIntentHandler;
  pending?: AccessInvitationAuthoringContract["pending"];
}) {
  const isDisabled = field.disabledReason !== undefined || pending !== undefined;
  const disabledMessage = field.disabledReason;
  const description = astryxAccessDisabledDescription([
    ...(field.disabledReason ? [field.disabledReason] : []),
    ...(field.options ?? []).flatMap((option) =>
      option.disabledReason ? [`${option.label}: ${option.disabledReason}`] : [],
    ),
  ]);
  const status = astryxAccessValidationStatus(field.errors);
  let control: ReactNode;

  if (field.inputKind === "select") {
    const options = field.options ?? [];
    control = (
      <Selector
        data-formless-astryx-access-field={field.id}
        description={description}
        disabledMessage={disabledMessage}
        hasSearch={options.length > SEARCHABLE_OPTION_COUNT}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) => void dispatchAstryxAccessFieldChange(onIntent, field, value)}
        options={options.map((option) => ({
          disabled: option.disabledReason !== undefined,
          label: option.label,
          value: option.value,
        }))}
        status={status}
        value={field.value}
        width="100%"
      />
    );
  } else if (field.inputKind === "datetime") {
    control = (
      <DateTimeInput
        data-formless-astryx-access-field={field.id}
        description={description}
        disabledMessage={disabledMessage}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) =>
          void dispatchAstryxAccessFieldChange(onIntent, field, value?.toString() ?? "")
        }
        status={status}
        value={(field.value || undefined) as ISODateTimeString | undefined}
        width="100%"
      />
    );
  } else {
    control = (
      <TextInput
        data-formless-astryx-access-field={field.id}
        description={description}
        disabledMessage={disabledMessage}
        isDisabled={isDisabled}
        isRequired={field.required}
        label={field.label}
        onChange={(value) => void dispatchAstryxAccessFieldChange(onIntent, field, value)}
        status={status}
        type={field.inputKind === "email" ? "email" : "text"}
        value={field.value}
        width="100%"
      />
    );
  }

  return control;
}

function AstryxAccessRoleSelection({
  onIntent,
  pending,
  selection,
}: {
  onIntent: AccessIntentHandler;
  pending?: AccessInvitationAuthoringContract["pending"];
  selection: AccessRoleSelectionContract;
}) {
  const isDisabled = selection.disabledReason !== undefined || pending !== undefined;
  const disabledReasons = [
    ...(selection.disabledReason ? [selection.disabledReason] : []),
    ...selection.options.flatMap((option) =>
      option.disabledReason ? [`${option.label}: ${option.disabledReason}`] : [],
    ),
  ];

  return (
    <VStack data-formless-astryx-access-role-selection={selection.id} gap={1} width="100%">
      <MultiSelector
        description={astryxAccessDisabledDescription(disabledReasons)}
        disabledMessage={selection.disabledReason}
        hasSearch={selection.options.length > SEARCHABLE_OPTION_COUNT}
        hasSelectAll={false}
        isDisabled={isDisabled}
        label={selection.label}
        onChange={(selectedOptionIds) =>
          void dispatchAstryxAccessRoleSelectionChange(onIntent, selection, selectedOptionIds)
        }
        options={selection.options.map((option) => ({
          disabled: option.disabledReason !== undefined,
          label: option.label,
          value: option.id,
        }))}
        status={astryxAccessValidationStatus(selection.errors)}
        triggerDisplay="labels"
        value={[...selection.selectedOptionIds]}
        width="100%"
      />
    </VStack>
  );
}

function AstryxAccessMembershipSelection({
  onIntent,
  pending,
  selection,
}: {
  onIntent: AccessIntentHandler;
  pending?: AccessInvitationAuthoringContract["pending"];
  selection: AccessMembershipSelectionContract;
}) {
  const optionCount = selection.groups.reduce((count, group) => count + group.options.length, 0);
  const disabledReasons = [
    ...(selection.disabledReason ? [selection.disabledReason] : []),
    ...selection.groups.flatMap((group) =>
      group.options.flatMap((option) =>
        option.disabledReason ? [`${option.label}: ${option.disabledReason}`] : [],
      ),
    ),
  ];

  return (
    <VStack data-formless-astryx-access-membership-selection={selection.id} gap={1} width="100%">
      <MultiSelector
        description={astryxAccessDisabledDescription(disabledReasons)}
        disabledMessage={selection.disabledReason}
        hasSearch={optionCount > SEARCHABLE_OPTION_COUNT}
        hasSelectAll={false}
        isDisabled={selection.disabledReason !== undefined || pending !== undefined}
        label={selection.label}
        onChange={(selectedOptionIds) =>
          void onIntent({ ...selection.changeIntent, selectedOptionIds })
        }
        options={selection.groups.map((group) => ({
          options: group.options.map((option) => ({
            disabled: option.disabledReason !== undefined,
            label: option.label,
            value: option.id,
          })),
          title: group.label,
          type: "section" as const,
        }))}
        status={astryxAccessValidationStatus(selection.errors)}
        triggerDisplay="labels"
        value={[...selection.selectedOptionIds]}
        width="100%"
      />
    </VStack>
  );
}

export function AstryxAccessPersonRoleAuthoring({
  authoring,
  onIntent,
}: {
  authoring: AccessPersonRoleAuthoringContract;
  onIntent: AccessIntentHandler;
}) {
  return (
    <Dialog
      aria-label={authoring.title}
      isOpen={authoring.open}
      onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
      purpose="form"
      width={560}
    >
      <AstryxAccessPersonRoleAuthoringContent authoring={authoring} onIntent={onIntent} />
    </Dialog>
  );
}

function AstryxAccessPersonRoleAuthoringContent({
  authoring,
  onIntent,
}: {
  authoring: AccessPersonRoleAuthoringContract;
  onIntent: AccessIntentHandler;
}) {
  const formId = `${authoring.id}:form`;

  return (
    <Layout
      content={
        <LayoutContent>
          <form
            aria-busy={authoring.pending?.isPending}
            id={formId}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void onIntent(authoring.save.intent);
            }}
          >
            <VStack gap={4} width="100%">
              <Text color="secondary" type="body">
                {authoring.description}
              </Text>
              <AstryxAccessRoleSelection
                onIntent={onIntent}
                pending={authoring.pending}
                selection={authoring.roleSelection}
              />
              {authoring.feedback ? (
                <AstryxAccessFeedbackToast feedback={authoring.feedback} />
              ) : null}
            </VStack>
          </form>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider>
          <HStack gap={2} justify="end" width="100%">
            <AstryxAccessAction action={authoring.cancel} onIntent={onIntent} />
            <AstryxAccessAction action={authoring.save} form={formId} onIntent={onIntent} />
          </HStack>
        </LayoutFooter>
      }
      header={
        <DialogHeader
          onOpenChange={(open) => void onIntent({ ...authoring.cancel.intent, open })}
          title={authoring.title}
        />
      }
    />
  );
}

function AstryxAccessConfirmation({
  confirmation,
  onIntent,
}: {
  confirmation: AccessConfirmationContract;
  onIntent: AccessIntentHandler;
}) {
  const actionDisabled = Boolean(
    confirmation.action.control.disabled || confirmation.action.control.pending?.isPending,
  );
  const cancelDisabled = Boolean(
    confirmation.cancel.control.disabled || confirmation.cancel.control.pending?.isPending,
  );
  const description = [confirmation.description, confirmation.action.control.disabledReason]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return (
    <AlertDialog
      actionLabel={astryxAccessButtonLabel(confirmation.action.control)}
      actionVariant="destructive"
      cancelLabel={astryxAccessButtonLabel(confirmation.cancel.control)}
      data-formless-astryx-access-confirmation={confirmation.id}
      description={description}
      isActionLoading={actionDisabled}
      isOpen={confirmation.open}
      onAction={() => {
        if (!actionDisabled) {
          void onIntent(confirmation.action.intent);
        }
      }}
      onOpenChange={(open) => {
        if (!cancelDisabled) {
          void onIntent({ ...confirmation.cancel.intent, open });
        }
      }}
      title={confirmation.title}
    />
  );
}

function AstryxAccessAction({
  action,
  destructive = false,
  form,
  onIntent,
}: {
  action: AccessActionContract;
  destructive?: boolean;
  form?: string;
  onIntent: AccessIntentHandler;
}) {
  return (
    <AstryxAccessControl
      button={action.control}
      destructive={destructive}
      form={form}
      onClick={form ? undefined : () => void onIntent(action.intent)}
    />
  );
}

function AstryxAccessControl({
  button,
  destructive = false,
  form,
  onClick,
}: {
  button: ButtonContract;
  destructive?: boolean;
  form?: string;
  onClick?: () => void;
}) {
  const content = button.content;
  const isIconOnly = content.kind === "iconOnly";
  const isLoading = Boolean(button.pending?.isPending);

  return (
    <Button
      data-formless-astryx-access-control={button.id}
      form={form}
      icon={content.kind === "label" ? undefined : operationIcon(content.icon)}
      isDisabled={Boolean(button.disabled || isLoading)}
      isIconOnly={isIconOnly}
      isLoading={isLoading}
      label={button.accessibilityLabel}
      onClick={onClick}
      size={button.density === "compact" ? "sm" : "md"}
      tooltip={button.disabledReason}
      type={button.type}
      variant={destructive ? "destructive" : astryxAccessButtonVariant(button.prominence)}
    >
      {isIconOnly ? undefined : content.label}
    </Button>
  );
}

function AstryxAccessFeedbackBanner({ feedback }: { feedback: AccessFeedbackContract }) {
  return (
    <Banner
      container="card"
      data-formless-astryx-access-feedback={feedback.id}
      description={feedback.detail}
      status={astryxAccessBannerStatus(feedback.intent)}
      title={feedback.title}
    />
  );
}
export function astryxAccessFeedbackToastOptions(feedback: AccessFeedbackContract): ToastOptions {
  const isFailure = feedback.intent === "danger";
  return {
    ...(isFailure ? {} : { autoHideDuration: 5000 }),
    body: feedback.title,
    collisionBehavior: "overwrite",
    isAutoHide: !isFailure,
    type: isFailure ? "error" : "info",
    uniqueID: feedback.id,
  };
}

function AstryxAccessFeedbackToast({ feedback }: { feedback: AccessFeedbackContract }) {
  const showToast = useToast();
  const feedbackRef = useRef(feedback);
  const feedbackUpdateKey = `${feedback.id}:${feedback.intent}:${feedback.title}`;
  feedbackRef.current = feedback;

  useEffect(() => {
    showToast(astryxAccessFeedbackToastOptions(feedbackRef.current));
  }, [feedbackUpdateKey, showToast]);

  return null;
}

export function dispatchAstryxAccessFieldChange(
  onIntent: AccessIntentHandler,
  field: AccessControlledFieldContract,
  value: string,
) {
  return onIntent({ ...field.changeIntent, value });
}

export function dispatchAstryxAccessRoleSelectionChange(
  onIntent: AccessIntentHandler,
  selection: AccessRoleSelectionContract,
  selectedOptionIds: readonly string[],
) {
  return onIntent({ ...selection.changeIntent, selectedOptionIds });
}

function submitAstryxAccessInvitation(
  event: FormEvent<HTMLFormElement>,
  authoring: AccessInvitationAuthoringContract,
  onIntent: AccessIntentHandler,
) {
  event.preventDefault();
  void onIntent(authoring.submit.intent);
}

function astryxAccessButtonLabel(button: ButtonContract): string {
  return button.content.kind === "iconOnly" ? button.accessibilityLabel : button.content.label;
}

function astryxAccessButtonVariant(prominence: ButtonContract["prominence"]): ButtonVariant {
  switch (prominence) {
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "quiet":
      return "ghost";
  }
}

function astryxAccessBadgeVariant(intent: AccessDisplayFactContract["intent"]): BadgeVariant {
  switch (intent) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "error";
    case "info":
      return "info";
    case "neutral":
    case undefined:
      return "neutral";
  }
}

function astryxAccessBannerStatus(intent: AccessFeedbackContract["intent"]): BannerStatus {
  switch (intent) {
    case "danger":
      return "error";
    case "warning":
      return "warning";
    case "success":
      return "success";
    case "info":
    case "neutral":
      return "info";
  }
}

function distinctStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

function astryxAccessDisabledDescription(values: readonly string[]): string | undefined {
  const description = distinctStrings(values).join(" ");
  return description || undefined;
}

function astryxAccessValidationStatus(errors: readonly string[]) {
  const message = errors[0];
  return message ? ({ message, type: "error" } as const) : undefined;
}

function astryxAccessFormErrors(authoring: AccessInvitationAuthoringContract): readonly string[] {
  const fieldErrors = new Set([
    ...Object.values(authoring.fields).flatMap((field) => field?.errors ?? []),
    ...authoring.roleSelection.errors,
    ...authoring.membershipSelection.errors,
  ]);

  return authoring.errors.filter((error) => !fieldErrors.has(error));
}
