import {
	AlbumExternalUrlHelper,
	ArtistExternalUrlHelper,
	ExternalUrl,
	ExternalUrlSource,
	TrackExternalUrlHelper,
} from "@sdk";

export class SoundCloudExternalUrlSource implements ExternalUrlSource {
	getAlbumUrls(helper: AlbumExternalUrlHelper): ExternalUrl[] | null {
		return null;
	}

	getArtistUrls(helper: ArtistExternalUrlHelper): ExternalUrl[] | null {
		const permalinks = helper.getIdentity(
			"soundcloud_artist_permalink",
			null,
			true,
		);
		if (permalinks?.length) {
			const ids = Array.from(
				new Set(permalinks.map((link) => link.identity)),
			).sort();
			return ids.map((id) => ({
				iconId: "soundcloud_logo",
				name: id,
				url: `https://soundcloud.com/${id}`,
			}));
		}

		return null;
	}

	getTrackUrls(helper: TrackExternalUrlHelper): ExternalUrl[] | null {
		return null;
	}
}
