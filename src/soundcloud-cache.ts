import { PersistentCache } from "./persistent-cache.js";
import Axios, { AxiosResponse } from "axios";
import SCUtils from "./util/soundcloud.util.js";
import type {
	Track as SCTrack,
	User as SCUser,
	Playlist as SCPlaylist,
	Playlist,
	WebProfile,
	SoundCloudPage,
	SoundCloudTrackLike,
} from "./types/soundcloud.js";

export class SoundCloudCache {
	private readonly cache: PersistentCache;

	constructor(dbFile: string) {
		this.cache = new PersistentCache(dbFile);
	}

	private axios() {
		return Axios.create({
			baseURL: "https://api-v2.soundcloud.com",
		});
	}

	getTrack(id: string | number) {
		return this.cache.getOrFind(`track:${id}`, async () => {
			await SCUtils.waitForConnection();
			const { data } = await this.axios().get<SCTrack>(
				`/tracks/${id}?client_id=${SCUtils.getClientId()}`,
			);
			return data;
		});
	}

	async getTracks(ids: (string | number)[]) {
		const MAX_CHUNK = 50; // todo: figure how much this actually can be

		const allIds = ids.map((id) => id.toString());
		const remainingIds = [...allIds];

		const idChunks: string[][] = [];
		while (remainingIds.length) {
			idChunks.push(remainingIds.splice(0, MAX_CHUNK));
		}

		await SCUtils.waitForConnection();
		const clientId = SCUtils.getClientId();

		const allTracks: (SCTrack | null)[] = Array(allIds.length).fill(null);

		for (const idChunk of idChunks) {
			const { data } = await this.axios().get<SCTrack[]>(`/tracks`, {
				params: {
					client_id: clientId,
					ids: idChunk.join(","),
				},
			});

			for (const track of data) {
				const index = allIds.indexOf(track.id.toString());
				if (index >= 0) {
					allTracks[index] = track;
				}
			}
		}

		return allTracks;
	}

	async cacheTrack(track: SCTrack) {
		if (!("title" in track)) {
			return;
		}
		await this.cache.set(`track:${track.id}`, track);
		if (track.user) {
			await this.cacheUser(track.user);
		}
	}

	getUser(id: number | string) {
		return this.cache.getOrFind(`user:${id}`, async () => {
			await SCUtils.waitForConnection();
			const { data } = await this.axios().get<SCUser>(
				`/users/${id}?client_id=${SCUtils.getClientId()}`,
			);
			return data;
		});
	}

	private async cacheUser(user: SCUser) {
		await this.cache.set(`user:${user.id}`, user);
	}

	getUserWebProfiles(id: number | string) {
		return this.cache.getOrFind(`user-webprofiles:${id}`, async () => {
			await SCUtils.waitForConnection();
			const { data } = await this.axios().get<WebProfile[]>(
				`/users/soundcloud:users:${id}/web-profiles?client_id=${SCUtils.getClientId()}`,
			);
			return data;
		});
	}

	async resolveTrackList(tracks: SCTrack[] | string[]) {
		const output = [...tracks.filter((track) => !!track)];

		if (!output.length) {
			return [];
		}

		let incomplete: string[];
		if (typeof output[0] == "string") {
			incomplete = [...(output as string[])];
		} else {
			incomplete = output
				.filter((track: any) => !("title" in track))
				.map((track) => (track as SCTrack).id.toString());
		}

		if (incomplete.length) {
			const cacheTracks = await this.cache.getMany<SCTrack>(
				incomplete.map((id) => `track:${id}`),
			);
			for (let i = incomplete.length - 1; i >= 0; i--) {
				const cacheTrack = cacheTracks[i];
				if (cacheTrack) {
					const index = output.findIndex(
						(track) =>
							(typeof track == "string" ? track : track.id.toString()) ==
							cacheTrack.id.toString(),
					);
					if (index >= 0) {
						output[index] = cacheTrack;
					}
					incomplete.splice(i, 1);
				}
			}
		}

		if (incomplete.length) {
			const tracks = await this.getTracks(incomplete);
			const resolvedTracks = tracks.filter((track) => !!track);
			for (const newTrack of resolvedTracks) {
				const index = output.findIndex(
					(track) =>
						(typeof track == "string" ? track : track.id.toString()) ==
						newTrack.id.toString(),
				);
				if (index >= 0) {
					output[index] = newTrack;
				}
			}
			await Promise.allSettled(
				resolvedTracks.map((track) => this.cacheTrack(track)),
			);
		}

		return output.map((track) =>
			typeof track == "object" ? track : null,
		) as (SCTrack | null)[];
	}

	getPlaylist(id: number | string) {
		return this.cache.getOrFind(
			`playlist:${id}`,
			async () => {
				await SCUtils.waitForConnection();
				const { data } = await this.axios().get<SCPlaylist>(
					`/playlists/${id}?client_id=${SCUtils.getClientId()}&representation=full&linked_partitioning=true`,
				);
				return data;
			},
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getSetList(id: string) {
		return this.cache.getOrFind(
			`setlist:${id}`,
			async () => {
				await SCUtils.waitForConnection();
				const { data } = await this.axios().get<SCPlaylist>(
					`/playlists/${id}?client_id=${SCUtils.getClientId()}&representation=full&linked_partitioning=true`,
				);
				const tracks = await this.resolveTrackList(data.tracks);
				return tracks.filter((track) => !!track);
			},
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getUserAlbums(id: number | string) {
		return this.cache.getOrFind(
			`user-albums:${id}`,
			async () =>
				this.handleCollection<Playlist>(
					`/users/${id}/albums?limit=200&linked_partitioning=true`,
				),
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getUserPlaylistsAndAlbums(id: number | string) {
		return this.cache.getOrFind(
			`user-playlists-albums:${id}`,
			async () =>
				this.handleCollection<Playlist>(
					`/users/${id}/playlists?limit=200&linked_partitioning=true`,
				),
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getUserPlaylists(id: number | string) {
		return this.cache.getOrFind(
			`user-playlists:${id}`,
			() =>
				this.handleCollection<Playlist>(
					`/users/${id}/playlists_without_albums?limit=200&linked_partitioning=true`,
				),
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getUserTracks(id: number | string) {
		return this.cache.getOrFind(
			`user-tracks:${id}`,
			() =>
				this.handleCollection<SCTrack>(
					`/users/${id}/tracks?limit=200&linked_partitioning=true`,
				),
			{
				ttl: 3600 * 1000,
			},
		);
	}

	getCache() {
		return this.cache;
	}

	getUserLikes(id: number | string) {
		return this.cache.getOrFind(
			`user-likes:${id}`,
			() =>
				this.handleCollection<SoundCloudTrackLike>(
					`/users/${id}/likes?limit=200&linked_partitioning=true`,
				),
			{
				ttl: 24 * 3600 * 1000,
			},
		);
	}

	private async handleCollection<T>(url: string) {
		await SCUtils.waitForConnection();
		const clientId = SCUtils.getClientId();

		const setUrl = (newUrl: string) => {
			if (newUrl.includes("?")) {
				newUrl += "&";
			} else {
				newUrl += "?";
			}
			newUrl += `client_id=${clientId}`;
			url = newUrl;
		};
		setUrl(url);

		const entries: T[] = [];

		while (url) {
			const { data }: AxiosResponse<SoundCloudPage<T>> =
				await this.axios().get(url);

			entries.push(...data.collection);

			if (data.next_href) {
				setUrl(data.next_href);
			} else {
				return entries;
			}
		}

		return [];
	}
}
