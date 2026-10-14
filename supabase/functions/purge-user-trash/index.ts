import { purgeTrashHandler } from '../_shared/user-trash.ts'
// The database authenticates a one-use expiring ticket before returning any rows.
Deno.serve(purgeTrashHandler())
