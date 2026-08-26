import {
	IdentifierDependency,
	Logger,
	TrackIdentifier,
	TrackIdentifierTarget,
	TrackInformationHelper,
} from "@pipe-bomb/plugin-sdk";
import { SoundCloudCache } from "../soundcloud-cache.js";

export class AlbumIdTrackIdentifier implements TrackIdentifier {
	public target: TrackIdentifierTarget = "album";
	public id = "soundcloud_album_id";

	constructor(private readonly cache: SoundCloudCache) {}

	async identify(
		helper: TrackInformationHelper,
		logger: Logger,
	): Promise<string[] | null> {
		const artistIdentifier = await helper.getIdentity("soundcloud_artist_id");
		if (!artistIdentifier) {
			return null;
		}

		const albums = await this.cache.getUserAlbums(artistIdentifier.identity);

		if (!albums.length) {
			return null;
		}

		const trackIdentity = await helper.getIdentity("soundcloud_track_id");
		if (!trackIdentity) {
			return null;
		}

		const matchingAlbums = albums.filter(
			(album) =>
				album.tracks?.length &&
				album.tracks.some(
					(track) => track.id && track.id.toString() === trackIdentity.identity,
				),
		);

		return matchingAlbums.map((album) => album.id.toString());
	}

	getDependencies(): IdentifierDependency[] {
		return [
			{
				sourceId: "soundcloud_artist_id",
				pluginId: null,
			},
		];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [
			{
				sourceId: "soundcloud_track_id",
				pluginId: null,
			},
		];
	}
}
