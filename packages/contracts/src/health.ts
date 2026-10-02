import { z } from 'zod';

export const Health = z.strictObject({
  status: z.literal('ok'),
});
export type Health = z.infer<typeof Health>;
