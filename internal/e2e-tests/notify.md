Post one Slack message. This step only delivers a message that was already decided; do not investigate, summarise or change anything.

Call the `post_channel_message` tool exactly once, with:

- `channelId`: the channel ID given below;
- `threadId`: `null` (post at the channel root, not in a thread);
- `text`: the text given below, verbatim — every character between the BEGIN and END lines, with nothing added, removed, reworded, reformatted or wrapped in quotes or code. It spans several lines and contains Slack markup such as `*bold*`, `<url|label>` links and escapes like `&lt;` and `&amp;`: keep all of it exactly as given, including the line breaks.

Do not post anything else, and do not call `post_channel_message` a second time, even to retry or correct.

Then end the step with `task_completed`:

- the post succeeded: call `task_completed` with `success: true`;
- the channel ID or the text is empty (do not post), or the post failed: call `task_completed` with `success: false` and a one-line reason (e.g. the tool's error).

Do not set `quitWorkflow`, and do not raise an error or stop the run in any other way: the workflow must continue to the next step whatever happens here.
channelId: `{{params.sanity_slack_channel_id}}`
text (between the BEGIN and END lines):
BEGIN
{{{outputs.run.output.text}}}
END
