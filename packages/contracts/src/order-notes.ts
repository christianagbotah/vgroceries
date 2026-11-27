import {z} from "zod";
export const orderNoteRequestSchema=z.object({note:z.string().trim().min(1).max(1000),internalOnly:z.boolean()}).strict();
export const orderNoteOutcomeSchema=z.object({orderId:z.string().min(1),noteId:z.string().min(1),internalOnly:z.boolean()}).strict();
export type OrderNoteRequest=z.infer<typeof orderNoteRequestSchema>;
