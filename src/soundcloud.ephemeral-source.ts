import {
	AlbumMetadata,
	ArtistMetadata,
	EphemeralAlbumContent,
	EphemeralArtistContent,
	EphemeralSource,
	EphemeralSourceApiContext,
	EphemeralSourceSearchOptions,
	EphemeralSourceSearchResults,
	EphemeralTrack,
	IdentifiableAlbumMetadata,
	IdentifiableArtistMetadata,
	LibraryHandler,
} from "@pipe-bomb/plugin-sdk";
import { SoundCloudCache } from "./soundcloud-cache.js";
import SCUtils from "./util/soundcloud.util.js";
import Axios from "axios";
import { Playlist, SearchResults, Track, User } from "./types/soundcloud.js";
import { SoundCloudAttributeSource } from "./soundcloud.attribute-source.js";

export class SoundCloudEphemeralSource implements EphemeralSource {
	private api!: EphemeralSourceApiContext;

	constructor(
		private readonly libraryHandler: LibraryHandler,
		private readonly cache: SoundCloudCache,
		private readonly attributeSource: SoundCloudAttributeSource,
	) {}

	readonly id = "soundcloud";

	enable(ephemeralSourceApiContext: EphemeralSourceApiContext) {
		this.api = ephemeralSourceApiContext;

		this.api.useAttributeSource(this.attributeSource);
		this.api.resolveArtistIdentifier("soundcloud_artist_id");
		this.api.resolveAlbumIdentifier("soundcloud_album_id");
		this.api.useTrackIdentifier("soundcloud_track_id");
	}

	getLibraryHandler(): LibraryHandler {
		return this.libraryHandler;
	}

	getName(): string {
		return "SoundCloud";
	}

	async search(
		options: EphemeralSourceSearchOptions,
	): Promise<EphemeralSourceSearchResults> {
		await SCUtils.waitForConnection();

		const { data } = await Axios.get<SearchResults>(
			`https://api-v2.soundcloud.com/search`,
			{
				params: {
					q: options.query,
					client_id: SCUtils.getClientId(),
					limit: 30,
				},
			},
		);

		const scTracks: Track[] = [];
		const scUsers: User[] = [];
		const scPlaylists: Playlist[] = [];

		for (const entry of data.collection) {
			switch (entry.kind) {
				case "track":
					scTracks.push(entry);
					break;
				case "user":
					scUsers.push(entry);
					break;
				case "playlist":
					scPlaylists.push(entry);
					break;
			}
		}

		await Promise.allSettled(
			scTracks.map((track) => this.cache.cacheTrack(track)),
		);

		const tracks: EphemeralTrack[] = scTracks.map((track) => {
			const trackMeta = this.attributeSource.toTrackMetadata(
				track,
				"soundcloud",
			);

			return {
				...trackMeta,
				id: track.id.toString(),
				title: track.title,
				identityId: "soundcloud_track_id",
				identity: track.id.toString(),
			};
		});

		const albums: IdentifiableAlbumMetadata[] = scPlaylists.map((playlist) => {
			const albumMeta = this.attributeSource.toAlbumMetadata(
				playlist,
				"soundcloud",
			);

			return {
				...albumMeta,
				pluginId: "soundcloud",
				identityId: "soundcloud_album_id",
				identity: playlist.id.toString(),
			};
		});

		const artists: IdentifiableArtistMetadata[] = scUsers.map((user) => {
			const artistMeta = this.attributeSource.toArtistMetadata(user);

			return {
				...artistMeta,
				pluginId: "soundcloud",
				identityId: "soundcloud_artist_id",
				identity: user.id.toString(),
			};
		});

		return {
			tracks,
			artists,
			albums,
		};
	}

	async resolveArtist(
		identifierId: string,
		identity: string,
	): Promise<ArtistMetadata | null> {
		if (identifierId != "soundcloud_artist_id") {
			return null; // todo: support permalink too
		}

		const user = await this.cache.getUser(identity);
		const artistMeta = this.attributeSource.toArtistMetadata(user);

		return {
			attributes: artistMeta.attributes ?? [],
		};
	}

	async resolveArtistContent(
		identifierid: string,
		identity: string,
	): Promise<EphemeralArtistContent | null> {
		if (identifierid != "soundcloud_artist_id") {
			return null; // todo: support permalink too
		}

		const scTracks = await this.cache.getUserTracks(identity);
		const tracks: EphemeralTrack[] = scTracks.map((track) => {
			const trackMeta = this.attributeSource.toTrackMetadata(
				track,
				"soundcloud",
			);

			return {
				...trackMeta,
				id: track.id.toString(),
				title: track.title,
				identityId: "soundcloud_track_id",
				identity: track.id.toString(),
			};
		});

		const scAlbums = await this.cache.getUserPlaylistsAndAlbums(identity);
		const albums: IdentifiableAlbumMetadata[] = scAlbums.map((album) => {
			const albumMeta = this.attributeSource.toAlbumMetadata(
				album,
				"soundcloud",
			);

			return {
				...albumMeta,
				pluginId: "soundcloud",
				identityId: "soundcloud_album_id",
				identity: album.id.toString(),
			};
		});

		const user = await this.cache.getUser(identity);
		albums.unshift({
			...this.attributeSource.toUserLikesMetadata(user, "soundcloud"),
			pluginId: "soundcloud",
			identityId: "soundcloud_album_id",
			identity: `${user.id}_likes`,
		});

		return {
			tracks,
			albums,
		};
	}

	async resolveAlbum(
		identityId: string,
		identity: string,
	): Promise<AlbumMetadata | null> {
		if (identityId != "soundcloud_album_id") {
			return null;
		}

		if (identity.endsWith("_likes")) {
			const userId = identity.substring(0, identity.length - "_likes".length);
			const user = await this.cache.getUser(userId);
			return this.attributeSource.toUserLikesMetadata(user, "soundcloud");
		}

		const scPlaylist = await this.cache.getPlaylist(identity);

		const albumMeta = this.attributeSource.toAlbumMetadata(
			scPlaylist,
			"soundcloud",
		);

		return albumMeta;
	}

	async resolveAlbumContent(
		identityId: string,
		identity: string,
	): Promise<EphemeralAlbumContent | null> {
		if (identityId != "soundcloud_album_id") {
			return null;
		}

		if (identity.endsWith("_likes")) {
			const userId = identity.substring(0, identity.length - "_likes".length);
			const likes = await this.cache.getUserLikes(userId);
			const likedTracks = (
				await this.cache.resolveTrackList(likes.map((like) => like.track))
			).filter((track) => !!track);
			const tracks: EphemeralTrack[] = likedTracks.map((track) => ({
				...this.attributeSource.toTrackMetadata(track, "soundcloud"),
				id: track.id.toString(),
				title: track.title,
				identityId: "soundcloud_track_id",
				identity: track.id.toString(),
			}));

			return { tracks };
		}

		const setList = await this.cache.getSetList(identity);

		const tracks: EphemeralTrack[] = setList.map((track) => ({
			...this.attributeSource.toTrackMetadata(track, "soundcloud"),
			id: track.id.toString(),
			title: track.title,
			identityId: "soundcloud_track_id",
			identity: track.id.toString(),
		}));

		return { tracks };
	}

	async resolveTracks(trackIds: string[]): Promise<EphemeralTrack[]> {
		const tracks = await this.cache.resolveTrackList(trackIds);

		return tracks
			.filter((track) => !!track)
			.map((track) => ({
				...this.attributeSource.toTrackMetadata(track, "soundcloud"),
				id: track.id.toString(),
				title: track.title,
				identityId: "soundcloud_track_id",
				identity: track.id.toString(),
			}));
	}
}
