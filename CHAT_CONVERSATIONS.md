# Assistant conversations

The web assistant has a fixed viewport layout: header/back navigation and composer stay visible while messages scroll. Desktop uses a conversation sidebar; mobile uses a horizontally scrollable chat list.

New chat starts a blank conversation and saves it on the first submitted question. The first question supplies its title (up to 80 characters, encrypted at rest). Selecting a saved chat loads only its messages. Voice questions use the selected conversation. Switching/deletion are disabled during an active answer or voice session.

Existing messages remain accessible in Saved history. Each chat can be permanently deleted after confirmation, including all its messages. Other chats are unaffected. The server scopes every operation by authenticated user, uses a composite ownership foreign key, and checks existence within the same user lock used to save answers. Deleting a conversation prevents an in-flight answer from restoring it. Existing legacy API consumers retain their history endpoints.

The startup schema creates chat_conversations and adds conversation_id to chat_messages. Account deletion cascades; data exports include conversation identifiers and decrypted titles. No AI calls are needed to name or manage chats.

Verification: chat-history unit tests and RUN_LOCAL_DB_TESTS=1 integration tests cover encrypted titles, per-chat history, cross-user access rejection, cascading deletion, and late-answer rejection. Frontend TypeScript, lint and production build validate the layout implementation. Manual authenticated browser verification remains necessary for visual and device checks.
