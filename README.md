<h1>
    <img src="https://raw.githubusercontent.com/Pipe-Bomb/.github/refs/heads/master/assets/logos/Pipe%20Bomb%20no%20background%20w%20outline.png" width="40" />
    SoundCloud Plugin
</h1>

Gives access to the entire SoundCloud music library via an Ephemeral Source. Also generates identities and attributes for tracks, albums and artists based on ISRC/EAN/UPC, or SoundCloud IDs.

**Requires the `ffmpeg` binary to be added to PATH.** Normally this is already the case, as FFmpeg is required by Pipe Bomb server anyway.

## Installation

Clone the repo into your [Pipe Bomb server's](https://github.com/pipe-bomb/server) `plugins` directory. Then inside, run:

```bash
npm ci
npm run build
```

## Usage

To decrypt SoundCloud's DRM, you'll need to locate L3 Widevine keys. Without them, the plugin can only provide audio for SoundCloud tracks that still expose an unencrypted audio stream, which is becoming increasingly rare. With L3 Widevine keys, you should be able to retrieve audio for any track that doesn't require SoundCloud Go.

## Identities

### Track

| Identity               | Dependencies                                                | Link   | Description                                                         |
| :--------------------- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| `soundcloud_album_id`  | `soundcloud_artist_id` (hard), `soundcloud_track_id` (soft) | Album  | SoundCloud's internal ID for the album that the track is a part of. |
| `soundcloud_artist_id` | `soundcloud_track_id` (soft)                                | Artist | SoundCloud's internal ID for the user that uploaded the track.      |
| `ean`                  | `soundcloud_track_id` (soft)                                |        | The EAN barcode associated with the track.                          |
| `isrc`                 | `soundcloud_track_id` (soft)                                |        | The ISRC code associated with the track.                            |
| `soundcloud_track_id`  |                                                             |        | SoundCloud's internal ID for the track.                             |
| `upc`                  | `soundcloud_track_id` (soft)                                |        | The UPC barcode associated with the track.                          |

### Album

| Identity               | Dependencies                 | Link   | Description                                                   |
| :--------------------- | ---------------------------- | ------ | ------------------------------------------------------------- |
| `soundcloud_artist_id` | `soundcloud_album_id` (hard) | Artist | SoundCloud's internal ID for the user that created the album. |

### Artist

| Identity                      | Dependencies                  | Description                                                                                   |
| :---------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| `soundcloud_artist_permalink` | `soundcloud_artist_id` (hard) | The "permalink" (slug) for the user. Used to construct URLs to artist pages, tracks and sets. |
| `spotify_artist_id`           | `soundcloud_artist_id` (hard) | The Spotify artist ID linked to the SoundCloud user's page.                                   |

## Attributes

### Track

| Attribute  | Type             | Multiple | Description                           |
| :--------- | ---------------- | -------- | ------------------------------------- |
| `title`    | `string`         | ❌       | The title of the track.               |
| `genre`    | `string`         | ❌       | The genres of the track.              |
| `front`    | `buffer` (image) | ❌       | The cover art of the track.           |
| `duration` | `decimal`        | ❌       | The duration of the track in seconds. |

### Artist

| Attribute    | Type             | Multiple | Description                                  |
| :----------- | ---------------- | -------- | -------------------------------------------- |
| `name`       | `string`         | ❌       | The name of the user.                        |
| `thumb`      | `buffer` (image) | ❌       | The profile picture of the user.             |
| `background` | `buffer` (image) | ❌       | The background banner of the user's profile. |

### Album

| Attribute | Type             | Multiple | Description                                                                                                     |
| :-------- | ---------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `title`   | `string`         | ❌       | The title of the album.                                                                                         |
| `front`   | `buffer` (image) | ❌       | The cover art of the album. If the album has no cover art, this falls back to the cover art of the first track. |
| `year`    | `integer`        | ❌       | The year the album was released.                                                                                |

## Contributing

Contributions are welcome!
