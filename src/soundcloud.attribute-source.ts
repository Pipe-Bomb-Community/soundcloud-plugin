import {
	AlbumInformationHelper,
	AlbumMetadata,
	ArtistInformationHelper,
	ArtistMetadata,
	AttributeSource,
	AttributeSourceApiContext,
	AttributeValue,
	BufferAttributeValue,
	IdentifiableTrackArtistMetadata,
	Logger,
	TrackAttributionHelper,
	TrackMetadata,
} from "@pipe-bomb/plugin-sdk";
import Axios, { AxiosError } from "axios";
import path from "path";
import { SoundCloudCache } from "./soundcloud-cache.js";
import { Playlist, Track as SCTrack, User } from "./types/soundcloud.js";

export class SoundCloudAttributeSource implements AttributeSource {
	public id = "soundcloud";
	private api!: AttributeSourceApiContext;
	private logger!: Logger;

	constructor(private readonly cache: SoundCloudCache) {}

	enable(attributeSourceApiContext: AttributeSourceApiContext): void {
		this.api = attributeSourceApiContext;
		this.logger = this.api.getLogger();

		this.api.registerTrackAttributes([
			{
				key: "title",
				type: "string",
				supportsMultiple: false,
			},
			{
				key: "genre",
				type: "string",
				supportsMultiple: true,
			},
			{
				key: "front",
				type: "buffer",
				supportsMultiple: false,
			},
			{
				key: "duration",
				type: "decimal",
				supportsMultiple: false,
				formatter: (value) => {
					let seconds = Math.floor(value);
					let minutes = Math.floor(seconds / 60);
					seconds -= minutes * 60;
					let hours = Math.floor(minutes / 60);
					minutes -= hours * 60;
					if (hours) {
						return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
					}
					return `${minutes}:${seconds.toString().padStart(2, "0")}`;
				},
			},
		]);

		this.api.registerArtistAttributes([
			{
				key: "name",
				type: "string",
				supportsMultiple: false,
			},
			{
				key: "thumb",
				type: "buffer",
				supportsMultiple: false,
			},
			{
				key: "background",
				type: "buffer",
				supportsMultiple: false,
			},
		]);

		this.api.registerAlbumAttributes([
			{
				key: "title",
				type: "string",
				supportsMultiple: false,
			},
			{
				key: "front",
				type: "buffer",
				supportsMultiple: false,
			},
			{
				key: "year",
				type: "integer",
				supportsMultiple: false,
			},
			{
				key: "releaseradar_exclude",
				type: "boolean",
				supportsMultiple: false,
			},
			{
				key: "release_date",
				type: "integer",
				supportsMultiple: false,
			},
		]);
	}

	getName(): string {
		return "SoundCloud";
	}

	private getImage(url: string): BufferAttributeValue {
		const extension = path.extname(url);
		const name = path.basename(url, extension);

		const SUFFIXES = [
			"mini",
			"tiny",
			"small",
			"badge",
			"t67x67",
			"large",
			"t200x200",
			"t300x300",
			"crop",
			"t500x500",
			"original",
		];

		return {
			extension: extension.substring(1),
			buffer: async () => {
				const potentialSuffix = name.split("-").pop()!;
				if (SUFFIXES.includes(potentialSuffix)) {
					const largeUrl =
						url.substring(
							0,
							url.length - potentialSuffix.length - extension.length,
						) +
						"original" +
						extension;

					if (largeUrl != url) {
						try {
							const { data } = await Axios.get<Buffer>(largeUrl, {
								responseType: "arraybuffer",
							});
							return data;
						} catch (e) {
							if (e instanceof AxiosError) {
								console.error(
									`Failed to load image in original size:`,
									e.response?.status,
									e.message,
								);
							} else {
								console.error(`Failed to load image in original size:`, e);
							}
						}
					}
				}

				try {
					const { data } = await Axios.get<Buffer>(url, {
						responseType: "arraybuffer",
					});
					return data;
				} catch (e) {
					if (e instanceof AxiosError) {
						throw new Error(
							`Failed to load image in passthrough size: ${e.response?.status} (${e.message})`,
						);
					}

					throw e;
				}
			},
		};
	}

	toArtistMetadata(user: User): ArtistMetadata {
		const attributes: AttributeValue[] = [
			{
				key: "name",
				value: user.username || user.full_name || user.first_name,
			},
		];

		if (user.avatar_url) {
			try {
				const value = this.getImage(user.avatar_url);
				attributes.push({
					key: "thumb",
					value,
				});
			} catch (e) {
				console.error(e);
			}
		}
		if (user.visuals?.visuals?.length) {
			const value = this.getImage(user.visuals.visuals[0]!.visual_url);
			attributes.push({
				key: "background",
				value,
			});
		}

		return { attributes };
	}

	toTrackMetadata(track: SCTrack, identifierPluginId: string): TrackMetadata {
		const attributes: AttributeValue[] = [];

		if (track.title) {
			attributes.push({
				key: "title",
				value: track.title,
			});
		}

		if (track.genre) {
			attributes.push({
				key: "genre",
				value: track.genre,
			});
		}

		if (track.duration) {
			attributes.push({
				key: "duration",
				value: track.duration / 1000,
			});
		}

		if (track.artwork_url) {
			const value = this.getImage(track.artwork_url);
			attributes.push({
				key: "front",
				value,
			});
		}

		const artists: IdentifiableTrackArtistMetadata[] = [];
		if (track.user?.id) {
			const attributes = this.toArtistMetadata(track.user);

			artists.push({
				...attributes,
				identityId: "soundcloud_artist_id",
				identity: track.user.id.toString(),
				pluginId: identifierPluginId,
			});
		}

		return {
			attributes,
			artists,
		};
	}

	async getTrackAttributeValues(
		helper: TrackAttributionHelper,
	): Promise<TrackMetadata> {
		const id = await helper.getIdentity("soundcloud_track_id");
		if (!id) {
			return {
				attributes: null,
				artists: null,
			};
		}

		try {
			const track = await this.cache.getTrack(id.identity);
			return this.toTrackMetadata(track, id.pluginId);
		} catch (e) {
			this.logger.error(e);
			throw e;
		}
	}

	async getArtistAttributeValues(
		helper: ArtistInformationHelper,
	): Promise<ArtistMetadata> {
		const id = helper.getIdentity("soundcloud_artist_id");
		if (!id) {
			return {
				attributes: null,
			};
		}

		const user = await this.cache.getUser(id.identity);
		return this.toArtistMetadata(user);
	}

	toAlbumMetadata(album: Playlist, identifierPluginId: string): AlbumMetadata {
		const attributes: AttributeValue[] = [];

		if (album.title) {
			attributes.push({
				key: "title",
				value: album.title,
			});
		}

		if (album.artwork_url) {
			const value = this.getImage(album.artwork_url);
			attributes.push({
				key: "front",
				value,
			});
		} else if (album.tracks?.length) {
			// fallback to artwork of first track in album
			const track = album.tracks[0]!;
			if (track?.artwork_url) {
				const value = this.getImage(track.artwork_url);
				attributes.push({
					key: "front",
					value,
				});
			}
		}

		const year = new Date(
			album.release_date ?? album.display_date,
		).getUTCFullYear();

		attributes.push({
			key: "year",
			value: year,
		});

		if (!album.is_album) {
			attributes.push({
				key: "releaseradar_exclude",
				value: true,
			});
		}

		if (album.created_at) {
			attributes.push({
				key: "release_date",
				value: new Date(album.created_at).getTime(),
			});
		}

		const artists: IdentifiableTrackArtistMetadata[] = [];
		if (album.user?.id) {
			const attributes = this.toArtistMetadata(album.user);

			artists.push({
				...attributes,
				identityId: "soundcloud_artist_id",
				identity: album.user.id.toString(),
				pluginId: identifierPluginId,
			});
		}

		return {
			attributes,
			artists,
		};
	}

	toUserLikesMetadata(user: User, identifierPluginId: string): AlbumMetadata {
		const attributes: AttributeValue[] = [
			{
				key: "title",
				value: `${user.username}'s Likes`,
			},
			{
				key: "releaseradar_exclude",
				value: true,
			},
		];

		if (user.avatar_url) {
			attributes.push({
				key: "front",
				value: this.getImage(user.avatar_url),
			});
		}

		return {
			attributes,
			artists: [
				{
					...this.toArtistMetadata(user),
					pluginId: identifierPluginId,
					identityId: "soundcloud_artist_id",
					identity: user.id.toString(),
				},
			],
		};
	}

	async getAlbumAttributeValues(
		helper: AlbumInformationHelper,
	): Promise<AlbumMetadata> {
		const albumIdentity = await helper.getIdentity("soundcloud_album_id");

		if (!albumIdentity) {
			return {
				attributes: null,
				artists: null,
			};
		}

		const album = await this.cache.getPlaylist(albumIdentity.identity);
		return this.toAlbumMetadata(album, albumIdentity.pluginId);
	}
}
