# YouTube Live

This module allows you to control YouTube live events/broadcasts.

Every action and feedback works upon a specified broadcast. The broadcast is
specified either by selecting it from a dropdown populated with recent
broadcasts that the action might be performed upon, or by specifying its ID (the
part after the `?v=...` in a YouTube video URL) as textual input. A checkbox
switches between the two modes.

Use **Create Broadcast + Stream** to prepare a new broadcast with a fresh RTMP
stream and key, or control broadcasts created in YouTube Studio.

## Available actions

- **Create Broadcast + Stream** - Creates a broadcast, a new RTMP stream, and
  binds them. Auto-start is disabled by default and can be explicitly enabled.
- **Start broadcast test** - This action initializes the broadcast. You'll need
  to explicitly use this only if you want to launch the so-called "monitor
  stream" of a broadcast. The same goal can be achieved by visiting the Live
  Control Room of the broadcast when stream video data is being sent to YouTube.
- **Go live** - This action starts the broadcast, making it viewable by the
  broadcast's audience.
- **Finish broadcast** - This action ends an active YouTube broadcast.
- **Advance broadcast to next phase** - This action transitions a broadcast to
  its next phase, whatever it might be: off → testing → live → finished.
- **Refresh broadcast/stream feedbacks** - This action refreshes the broadcast
  lifecycle status/stream health and their feedbacks/variables. This can
  typically be useful for quickly checking if your RTMP stream data has
  successfully reached the corresponding YouTube endpoint.
- **Reload everything from YouTube** - This action forces all cached data to be
  reloaded from YouTube. Use this action to make broadcasts created after
  Companion startup appear in the Companion UI.
- **Send message to live chat** - This action sends a message (200 chars max.)
  to a YouTube broadcast's live chat.
- **Insert advertisement (cuepoint)** - This action inserts an advertisement in
  the YouTube broadcast.
- **Set visibility** - This action sets the visibility (publicly viewable and
  listed in your YouTube channel, publicly viewable but unlisted in your
  channel, privately viewable only by specific people) of the specified
  broadcast.
- **Set title** - This action sets the title of the specified broadcast.
- **Set description** - This action sets the description of the specified
  broadcast.
- **Prepend text to description** - This action inserts the given text at
  beginning of the description.
- **Append text to description** - This action inserts the given text at end of
  the description.
- **Add chapter timecode to description** - This action inserts a chapter
  timecode at the end of the description.

[ytapi]: https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/transition

## Configuration

To use Companion to manipulate the YouTube broadcasts in a YouTube channel,
you'll need to perform some Google/YouTube setup.

### Create a Google Cloud project

First, create a Google Cloud project (or select an existing one) to host a
Google Cloud application that Companion can manipulate to perform actions.

1. Open the [Google Cloud Console](https://console.cloud.google.com/home/dashboard)
   and select "Create a Project".
   - Name it whatever you want -- the name won't appear anywhere visible to
     anyone using Companion.
2. Select the project once you've created it, using the "Select" UI that appears
   for it.
3. Under "Getting Started" on the project dashboard, select "Explore and enable
   APIs", then click "Enable APIs and services".
4. Find the "YouTube Data API v3" API, click on it, then click "Enable" in the
   API's overview page.

### Create an application

Next create a Google Cloud application in the project to manipulate YouTube
channel broadcasts.

1. Go to [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials).
2. Click the "Configure consent screen" button, then click "Get started".
3. Under "App Information":
   - Enter a name for the application that will be displayed when you grant
     consent to the application to manipulate your YouTube channel.
   - Enter an email address for "support" for the application, that will be
     displayed during the consent process. (This should probably be your own
     email address.)
4. Under "Audience":
   - Select "External". (This audience will be narrowed to specific test users
     shortly.)
   - (Unfortunately, if you're using a Google account in a Google Workspace, the
     "Internal" audience type won't work to manipulate a YouTube brand account
     within that Workspace -- only to manipulate non-brand YouTube channels.
     This is a [known](https://issuetracker.google.com/issues/218885162)
     [issue](https://issuetracker.google.com/issues/188719921): the recommended
     workaround is to set it to "External" audience and add specific test users,
     i.e. to do what this document recommends.)
5. Under "Contact Information", use your own email address.

Then give the application the power to edit YouTube broadcast data:

1. Go to [https://console.cloud.google.com/auth/scopes](https://console.cloud.google.com/auth/scopes).
2. Click "Add or remove scopes".
3. Add `https://www.googleapis.com/auth/youtube.force-ssl` as a scope.
4. Click "Save" at bottom of the page.

### Create application credentials and enter them in Companion

Create application credentials (a client ID and a client secret) that can be
used to connect to the application.

1. Within your project, click on "Clients", then the "+ Create client" button.
2. Select the "Web application" application type.
3. Give the client whatever name you want, for example "YouTube Companion app".
   (This only appears in the Google Cloud interface.)
4. In the "Authorized redirect URIs" section, specify a URL on `localhost` that
   includes a port number that isn't in use.
   - For example, if loading [`http://localhost:3000`](http://localhost:3000)
     displays a "Site not found" page when you click it, you could enter
     `http://localhost:3000`.
   - Or if `3000` loads, instead try some other random number: `9362` or
     `28667`, say. (It can be pretty much any positive number smaller than
     `65536`, but avoid using numbers smaller than `1000`.)
5. Copy/paste the URL you set as an authorized redirect URI into the Companion
   **OAuth redirect URL** setting _exactly as written_.
   - _Don't accidentally add a trailing slash or whitespace!_
6. Click "Create".

A dialog will display, showing the created client ID and a client secret. (The
client secret will be inaccessible once you close the dialog, so if you lose it,
you'll have to create new credentials.) The created client ID and client secret
should look something like this:

|                   | **Value**                                                                  |
| ----------------- | -------------------------------------------------------------------------- |
| **Client ID**     | `123456789012-abcdef1ghij2klmno34pqr56stu7vwxy.apps.googleusercontent.com` |
| **Client secret** | `ABCDEF-GH1iJkl2mnoPQrsTuvwx3YZABcdE`                                      |

Copy/paste these into Companion connection settings, then save settings.

### Set the audience for your application

Next, allow your Google account to access the application by adding your account
(and any others you want to have access) as a permitted user of it, if
necessary. (An "Internal" user type will not require this, but it may require
other steps be taken to register users for access that are beyond the scope of
this document. And if you have the resources to get an "External" app fully
reviewed, you probably shouldn't be relying on these instructions!)

1. Go to [https://console.cloud.google.com/auth/audience](https://console.cloud.google.com/auth/audience).
2. With an "External" user type in "Testing" status, you must manually add your
   Google account as a user.
   - Scroll down to the "Test users" section, and add the email address of the
     Google account you want to use to access your YouTube channel.
   - **Note:** Each time you give consent for YouTube to allow Companion to
     manipulate your YouTube broadcasts, you'll have to ignore a warning about
     the app being in testing.

### Give consent to YouTube to perform YouTube operations as requested by Companion

Finally, open the YouTube consent screen for your Google Cloud application by
clicking the link in connection settings. (The full consent link is also logged
in the connection log after you click the link in settings.) Instructions for
completing the consent process can be found underneath that link.

Consent while in "Testing" status only lasts a week. After that you'll have to
reopen the consent screen and recomplete the consent process.

## Action configuration

When creating actions to operate upon a broadcast, pick the broadcast to work
with from the dropdown menu. The dropdown will contain all previously created
broadcasts that the action might be performed on _eventually_: for example, the
action to start a broadcast will list unstarted broadcasts while omitting those
already started, while the action to send a message to live chat will list
unstarted and live broadcasts but will omit completed broadcasts.

Alternatively, if you have the YouTube broadcast ID, you can check the checkbox
to switch to a text input and enter it there. The text field supports
variables, so you can also store the broadcast ID in a variable and change that
variable as needed.

## Create Broadcast + Stream

Requires Companion 4.1 or later (module API 1.13) and a YouTube channel enabled
for live streaming. Use the connection's existing OAuth setup; no additional
Google Cloud project or client is needed. The existing `youtube.force-ssl`
scope authorizes broadcast creation, stream creation and binding.

| Option                              | Default          | Details                                                                       |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| Broadcast title                     | Neuer Livestream | 1–100 characters after Companion variable expansion                           |
| Description                         | Empty            | Up to 5000 characters; multiline and variables supported                      |
| Visibility                          | Unlisted         | Public, Unlisted or Private                                                   |
| Resolution                          | Variable         | Variable, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p                         |
| Framerate                           | Variable         | Variable, 30fps or 60fps                                                      |
| Auto-start when encoder sends video | Off              | When enabled, YouTube goes live when the encoder sends video with the new key |

Resolution and framerate must **both** be Variable, or **both** be fixed.
Angle brackets are rejected in title/description. YouTube validates any further
restrictions. The scheduled start is five minutes after the button press;
this is scheduling metadata, not a timer that starts the broadcast. Auto-start
is off by default; auto-stop remains disabled. A monitor stream is enabled so the
existing testing action works. Each invocation uses `liveStreams.insert` with
`isReusable: false`; existing stream keys are never reused by this action.

### Variables and encoder setup

After all three API calls succeed, these variables update together:

| Variable             | Value                   |
| -------------------- | ----------------------- |
| `last_broadcast_id`  | Created broadcast ID    |
| `last_broadcast_url` | YouTube watch URL       |
| `last_stream_id`     | Created live stream ID  |
| `last_stream_key`    | Secret stream key       |
| `last_rtmp_url`      | RTMP ingest server URL  |
| `last_stream_title`  | Created broadcast title |

For a connection labelled `youtube-live`, use `$(youtube-live:last_stream_key)`
and `$(youtube-live:last_rtmp_url)` in a compatible encoder module's variable-aware
key and server fields. For a combined destination use
`$(youtube-live:last_rtmp_url)/$(youtube-live:last_stream_key)`. Replace the
connection label if yours is different. Check that the encoder's action accepts
variables and that its own logging does not expose the key. Do not display the
key on public buttons, overlays or screenshots. This module does not configure
an encoder automatically.

The action callback remains pending until the three API calls succeed and all
six new variable values have been sent to Companion. Normal button action lists
execute concurrently. An internal Action Group in Sequential mode waits for the
callback, but Companion documents a five-second execution timeout; errors and
timeouts do not guarantee that subsequent actions stop. A failed creation keeps
the previous successful key. Do not use completion alone as a success check.
Use a separate button after verifying a new result, or a deliberately armed
trigger watching the new broadcast ID/key. An unguarded variable-change trigger
can also fire when variables are restored after a restart. Do not assume that a
fixed delay always waits long enough for YouTube.

With **Auto-start off**, use the following manual workflow:
Start sending video from the encoder. On another button add **Start broadcast
test**, or **Go live** when ready. Enable **Specify broadcast ID from text**
and enter `$(youtube-live:last_broadcast_id)`. **Go live** handles the monitoring
transition when needed. **Finish broadcast** and **Advance broadcast to next
phase** accept the same variable. These actions still require the appropriate
YouTube lifecycle state and an active encoder stream. An unlisted broadcast's
watch page can exist before the broadcast goes live.

With **Auto-start on**, create the broadcast, transfer its new server/key to the
encoder, then start the encoder. YouTube can go live as soon as it receives video.
Do not expect a private testing stage or require a separate Go live action in
this mode. The option affects only broadcasts created by this invocation; it
does not modify existing broadcasts. Finish broadcast is still required to end
the broadcast because auto-stop remains off.

### Persistence and failures

Only the last successful broadcast ID and stream ID are saved in connection
configuration. Stream keys remain in memory and Companion variables; this module
does not write them into configuration or logs. On startup and **Reload
everything from YouTube**, the module reads the saved resources through the
existing authenticated API client and restores the variables, even if the
broadcast is outside the recent-broadcast limit. This requires internet access,
valid consent and both resources to still exist and be bound. Until restoration
succeeds after a restart, the variables are empty. A temporary restore failure
during the same session retains the previous values. Existing OAuth secret
storage and token refresh are unchanged.

Creation failures leave the previous successful variables and IDs unchanged.
Concurrent presses on the same connection are ignored while a creation or full
reload is running; a later deliberate press creates another broadcast. Separate
connections have independent locks. Connection reconfiguration waits for an
in-flight creation before replacing its client.

If stream creation or binding fails, the module attempts to delete only the new
broadcast, then its new stream. If broadcast deletion fails, it retains the
possibly bound stream. Cleanup failures report resource IDs for manual inspection
in YouTube Studio, never stream keys or raw API error objects. There is no
automatic retry of creation requests. A lost response or process crash can leave
resources whose IDs were never received: check Studio before retrying and remove
unused resources manually. Cleanup can also fail when quota or authorization is
exhausted. Successful broadcasts/streams are never automatically cleaned up.

Quota/rate limits, channel live-streaming restrictions, invalid/revoked OAuth
consent and service outages can prevent creation. Access-token refresh uses the
existing OAuth client; revoked consent may require authorizing that same client
again. API calls are not atomic and cannot guarantee exactly-once creation
across network failures or restarts. Channel audience / made-for-kids settings
are not overridden; verify them in Studio as appropriate.

Official references:
[Broadcast insert](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/insert),
[Stream insert](https://developers.google.com/youtube/v3/live/docs/liveStreams/insert),
[Binding](https://developers.google.com/youtube/v3/live/docs/liveBroadcasts/bind),
[Stream settings](https://developers.google.com/youtube/v3/live/docs/liveStreams),
[Companion API versions](https://companion.free/for-developers/module-development/).

## Thanks

Big thanks to members of [AVC Silicon Hill](https://avc.sh.cvut.cz/) for
inspiration for further development.
