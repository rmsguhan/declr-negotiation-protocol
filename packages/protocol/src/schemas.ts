import { z } from 'zod';

/** Supported delivery methods in v0.1. */
export const DeliveryMethodSchema = z.enum(['postal', 'hand_deliver', 'courier']);

/** The six DNP message kinds. */
export const MessageTypeSchema = z.enum([
  'proposal',
  'counter',
  'accept',
  'reject',
  'escalate',
  'withdraw',
]);

export const CatalogItemRefSchema = z.object({
  itemId: z.string().min(1),
  itemType: z.enum(['Offer', 'Demand']),
  catalogUrl: z.string().url(),
});

export const PriceParameterSchema = z.object({
  value: z.number().finite(),
  currency: z.string().min(1),
});

export const DeliverySpeedParameterSchema = z
  .object({
    min: z.number().int(),
    max: z.number().int(),
  })
  .refine((v) => v.min <= v.max, { message: 'deliverySpeedDays.min must be <= max' });

export const NegotiationParametersSchema = z.object({
  price: PriceParameterSchema,
  deliverySpeedDays: DeliverySpeedParameterSchema,
  deliveryMethod: DeliveryMethodSchema,
  quantity: z.number().int().positive(),
});

export const NegotiationStateSchema = z.object({
  roundNumber: z.number().int().positive(),
  parameters: NegotiationParametersSchema,
  proposedBy: z.string().min(1),
});

export const NegotiationContextSchema = z.object({
  rationale: z.string().optional(),
  escalationReason: z.string().nullable(),
  humanApprovalRequired: z.boolean(),
  /** Optional fallback terms; omitted or null until used by a strategy. */
  lastAcceptableTerms: NegotiationParametersSchema.nullable().optional(),
});

export const MetadataSchema = z.object({
  extensions: z.array(z.unknown()),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Canonical on-the-wire negotiation payload nested in an A2A `DataPart`.
 * Use `.strict()` so unknown top-level fields are rejected.
 */
export const DnpPayloadSchema = z
  .object({
    dnpVersion: z.string().min(1),
    messageType: MessageTypeSchema,
    catalogItemRef: CatalogItemRefSchema,
    senderAgentId: z.string().min(1),
    recipientAgentId: z.string().min(1),
    negotiationState: NegotiationStateSchema,
    context: NegotiationContextSchema,
    metadata: MetadataSchema,
  })
  .strict();

export type DnpPayload = z.infer<typeof DnpPayloadSchema>;
export type NegotiationParameters = z.infer<typeof NegotiationParametersSchema>;
export type MessageType = z.infer<typeof MessageTypeSchema>;
export type DeliveryMethod = z.infer<typeof DeliveryMethodSchema>;
