import { WebProfileArtistIdentifier } from "./web-profile.artist-identifier.js";
import { WebProfile } from "../types/soundcloud.js";

export class SpotifyArtistIdArtistIdentifier extends WebProfileArtistIdentifier {
	public readonly id = "spotify_artist_id";

	protected getProfileId(profile: WebProfile): string | null {
		if (
			profile.network == "spotify" &&
			profile.url.startsWith("https://open.spotify.com/artist/")
		) {
			return profile.url
				.substring("https://open.spotify.com/artist/".length)
				.split("?")[0]!;
		}
		return null;
	}
}
