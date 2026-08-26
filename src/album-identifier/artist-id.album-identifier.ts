import {
	AlbumIdentifier,
	AlbumIdentifierTarget,
	AlbumInformationHelper,
	IdentifierDependency,
	Logger,
} from "@pipe-bomb/plugin-sdk";
import { SoundCloudCache } from "../soundcloud-cache.js";

export class ArtistIdAlbumIdentifier implements AlbumIdentifier {
	public readonly id = "soundcloud_artist_id";
	public readonly target: AlbumIdentifierTarget = "artist";

	constructor(private readonly cache: SoundCloudCache) {}

	async identify(
		helper: AlbumInformationHelper,
		logger: Logger,
	): Promise<string[] | null> {
		const albumIdentity = await helper.getIdentity("soundcloud_album_id");

		if (!albumIdentity) {
			return null;
		}

		const album = await this.cache.getPlaylist(albumIdentity.identity);

		if (album.user_id) {
			return [album.user_id.toString()];
		}

		return null;
	}

	getDependencies(): IdentifierDependency[] {
		return [
			{
				sourceId: "soundcloud_album_id",
				pluginId: null,
			},
		];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [];
	}
}
