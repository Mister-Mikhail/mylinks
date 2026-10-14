import { deletionHandler } from '../_shared/delete-account.ts'
Deno.serve(deletionHandler(true))
