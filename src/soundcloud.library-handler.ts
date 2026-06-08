import {
	AudioProducer,
	AudioProducerType,
	HLSAudioProducer,
	HLSPlaylist,
	LibraryHandler,
	LibraryHandlerApiContext,
	StreamAudioProducer,
	TaskRunContext,
	Track,
} from "@sdk";
import { SoundCloud, Track as SCTrack, Transcoding } from "scdl-core";
import Axios from "axios";
import { Playlist, SoundCloudLikesPage } from "./types/soundcloud.js";
import { Readable } from "stream";
import SCUtils from "./util/soundcloud.util.js";
import { SoundCloudCache } from "./soundcloud-cache.js";
import { DeviceType, KeyContainer, LicenseType, Widevine } from "widevine";
import { readFile } from "fs/promises";
import { spawn } from "child_process";
import { SoundCloudConfigManager } from "./soundcloud.config-manager.js";
import { WideVine } from "./widevine.js";

const SOUNDCLOUD_USER = "eyezahh";

// const SOUNDCLOUD_PLAYLIST = "1570556182";
const SOUNDCLOUD_PLAYLIST = "2233713206"; // knock2 x knockthisoff test

export class SoundCloudLibraryHandler implements LibraryHandler {
	public readonly id = "soundcloud";
	private api!: LibraryHandlerApiContext;

	constructor(
		private readonly cache: SoundCloudCache,
		private readonly widevine: WideVine,
	) {}

	async enable(libraryHandlerApiContext: LibraryHandlerApiContext) {
		this.api = libraryHandlerApiContext;

		this.api.registerPluginTask({
			id: "scan",
			resumable: false,
			run: (ctx) => this.scan(ctx),
		});

		// const clientId = await readFile(
		// 	"plugins/soundcloud/widevine/client_id.bin",
		// );
		// const privateKey = await readFile(
		// 	"plugins/soundcloud/widevine/private_key.pem",
		// );

		// this.widevine = Widevine.init(clientId, privateKey, DeviceType.ANDROID);
	}

	getName(): string {
		return "SoundCloud";
	}

	private toStreamProducer(url: string, duration: number): StreamAudioProducer {
		return {
			type: "stream",
			cacheable: true,
			getMetadata: async () => {
				const { headers } = await Axios.head(url);
				return {
					mimeType: headers["Content-Type"] as string,
					size: Number(headers["Content-Length"]),
				};
			},
			getStream: async () => {
				const { data } = await Axios.get<Readable>(url, {
					responseType: "stream",
				});
				return data;
			},
			getDuration: async () => duration,
			getPart: async (start, end) => {
				const { data } = await Axios.get<Readable>(url, {
					responseType: "stream",
					headers: {
						range: `bytes=${start}-${end}`,
					},
					validateStatus: (status) => status == 200 || status == 206,
				});
				return data;
			},
		};
	}

	private async toHLSProducer(
		manifestUrl: string,
		track: SCTrack,
		mimeType: string,
		licenseToken: string | null,
	): Promise<HLSAudioProducer> {
		const { data: manifest } = await Axios.get<string>(manifestUrl);

		const lines = manifest.split("\n").map((line) => line.trim());
		const playlist: HLSPlaylist = {
			version: 3,
			targetDuration: 10,
			mediaSequence: 0,
			playlistType: "VOD",
			segments: [],
			containerType: "ts",
		};

		let currentDuration = 0;
		let keyInfo: { pssh: Buffer; iv: string } | null = null;
		let initSegmentUrl: string | null = null;

		for (const line of lines) {
			if (line.startsWith("#EXT-X-KEY:")) {
				const uriMatch = line.match(/URI="([^"]+)"/);
				const ivMatch = line.match(/IV=0x([a-fA-F0-9]+)/);

				if (ivMatch && uriMatch) {
					keyInfo = {
						pssh: Buffer.from(uriMatch[1]!.split(",")[1]!, "base64"),
						iv: ivMatch[1]!,
					};
				}
			} else if (line.startsWith("#EXT-X-VERSION:")) {
				playlist.version = parseInt(line.split(":")[1]!, 10);
			} else if (line.startsWith("#EXT-X-TARGETDURATION:")) {
				playlist.targetDuration = parseInt(line.split(":")[1]!, 10);
			} else if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
				playlist.mediaSequence = parseInt(line.split(":")[1]!, 10);
			} else if (line.startsWith("#EXT-X-PLAYLIST-TYPE:")) {
				playlist.playlistType = line.split(":")[1] as "VOD" | "EVENT";
			} else if (line.startsWith("#EXT-X-MAP:")) {
				const match = line.match(/URI="(.*)"/);
				playlist.containerType = "fmp4";
				if (match) {
					initSegmentUrl = match[1] ?? null;
					// unencrypted playlists are sent without transcoding and need their init segment
					if (!licenseToken) {
						playlist.initSegmentId = match[1];
					}
				}
			} else if (line.startsWith("#EXTINF:")) {
				const durationPart = line.split(":")[1]!.split(",")[0]!;
				currentDuration = parseFloat(durationPart);
			} else if (line.length > 0 && !line.startsWith("#")) {
				// todo: decrypted segments should actually be .ts, not .m4s
				playlist.segments.push({
					id: line,
					duration: currentDuration,
				});
				if (line.includes(".aac") && playlist.containerType !== "fmp4") {
					playlist.containerType = "aac";
				}
			}
		}

		let licenseInfo: KeyContainer | null = null;

		if (licenseToken) {
			if (!keyInfo) {
				throw new Error("HLS Playlist didn't contain key");
			}
			if (!initSegmentUrl) {
				throw new Error("HLS Playlist didn't contain init segment");
			}
			const wideVineClient = await this.widevine.getClient();
			if (!wideVineClient) {
				throw new Error("DRM decryption not supported");
			}

			const session = wideVineClient.createSession(
				keyInfo.pssh,
				LicenseType.AUTOMATIC,
			);
			const challenge = session.generateChallenge();

			const { data: rawLicense } = await Axios.post<Buffer>(
				`https://license.media-streaming.soundcloud.cloud/playback/widevine?license_token=${licenseToken}`,
				challenge,
				{
					headers: {
						"Content-Type": "application/octet-stream",
						"User-Agent":
							"Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0",
					},
					responseType: "arraybuffer",
				},
			);

			const data = session.parseLicense(rawLicense);

			licenseInfo = data.find((entry) => !!entry) ?? null;
			if (!licenseInfo) {
				throw new Error("No DRM License info");
			}
		}

		let initSegment: Buffer | null = null;

		return {
			type: "hls",
			cacheable: true,
			getMetadata: async () => {
				return {
					duration: track.duration / 1000,
					mimeType: licenseInfo ? "video/mp2t" : mimeType,
				};
			},
			getPlaylist: async () => playlist,
			getSegment: async (url) => {
				if (!initSegment && initSegmentUrl) {
					const { data } = await Axios.get<Buffer>(initSegmentUrl!, {
						responseType: "arraybuffer",
					});

					initSegment = Buffer.from(data);
				}

				if (initSegmentUrl && url === initSegmentUrl) {
					return initSegment;
				}

				const { data } = await Axios.get(url, {
					responseType: "arraybuffer",
				});

				if (licenseInfo) {
					const combined = Buffer.concat([initSegment, data]);

					const ffmpeg = spawn("ffmpeg", [
						"-decryption_key",
						licenseInfo!.key,
						"-i",
						"pipe:0",
						"-codec",
						"copy",
						"-f",
						"mpegts",
						"pipe:1",
					]);

					let stderrOutput = "";
					ffmpeg.stderr.on("data", (chunk: Buffer) => {
						stderrOutput += chunk.toString();
					});

					ffmpeg.on("error", (err) => {
						ffmpeg.stdout.destroy(
							new Error(`Failed to spawn FFmpeg: ${err.message}`),
						);
					});

					ffmpeg.on("close", (code) => {
						if (code !== 0) {
							ffmpeg.stdout.destroy(
								new Error(
									`FFmpeg processing failed with code ${code}. Details: ${stderrOutput}`,
								),
							);
						}
					});

					ffmpeg.stdin.write(combined);
					ffmpeg.stdin.end();

					return ffmpeg.stdout;
				}

				return data;
			},
		};
	}

	private async rankTranscodings(
		transcodings: Transcoding[],
	): Promise<Transcoding[]> {
		const codecWeights: Record<string, number> = { opus: 3, aac: 2, mp3: 1 };
		const qualityWeights = { sq: 2, lq: 1 };
		const protocolWeights = {
			progressive: 4,
			hls: 3,
			"ctr-encrypted-hls": 2,
		};

		const wideVineClient = await this.widevine.getClient();

		return transcodings
			.filter((t) => {
				const isSnipped = t.snipped === true;
				const isCbc = t.format.protocol === "cbc-encrypted-hls";
				const isAbr = t.preset.includes("abr");
				const noDrm =
					!wideVineClient && t.format.protocol === "ctr-encrypted-hls";
				return !isSnipped && !isCbc && !isAbr && !noDrm;
			})
			.sort((a, b) => {
				const getBitrate = (p: string) => {
					const match = p.match(/(\d+)/);
					if (match) {
						return parseInt(match[0]);
					}
					return 128;
				};
				const bitrateA = getBitrate(a.preset);
				const bitrateB = getBitrate(b.preset);
				if (bitrateB !== bitrateA) return bitrateB - bitrateA;

				const qualityA =
					qualityWeights[a.quality as keyof typeof qualityWeights] || 0;
				const qualityB =
					qualityWeights[b.quality as keyof typeof qualityWeights] || 0;
				if (qualityB !== qualityA) return qualityB - qualityA;

				const getCodecWeight = (p: string) => {
					if (p.includes("opus")) return codecWeights.opus!;
					if (p.includes("aac")) return codecWeights.aac!;
					if (p.includes("mp3")) return codecWeights.mp3!;
					return 0;
				};
				const codecWeightA = getCodecWeight(a.preset);
				const codecWeightB = getCodecWeight(b.preset);
				if (codecWeightB !== codecWeightA) {
					return codecWeightB - codecWeightA;
				}

				const getProtoWeight = (p: string) => {
					return protocolWeights[p as keyof typeof protocolWeights] || 0;
				};
				const protoWeightA = getProtoWeight(a.format.protocol);
				const protoWeightB = getProtoWeight(b.format.protocol);
				if (protoWeightB !== protoWeightA) {
					return protoWeightB - protoWeightA;
				}

				return 0;
			});
	}

	async getAudioProducer(
		trackId: string,
		type: AudioProducerType,
	): Promise<AudioProducer | null> {
		await SCUtils.waitForConnection();
		// const scTrack = await this.cache.getTrack(track.id);
		// this.cache.getCache().set(`track:${scTrack.id}`, scTrack);
		const { data: scTrack } = await Axios.get<SCTrack>(
			`https://api-v2.soundcloud.com/tracks/${trackId}?client_id=${SCUtils.getClientId()}`,
		);

		const trackAuthorization: string = (scTrack as any).track_authorization;

		const transcodings: Transcoding[] = [];
		if (!type) {
			transcodings.push(
				...(await this.rankTranscodings(scTrack.media.transcodings)),
			);
		} else if (type == "hls") {
			transcodings.push(
				...(await this.rankTranscodings(
					scTrack.media.transcodings.filter((t) =>
						t.format.protocol.includes("hls"),
					),
				)),
			);
		} else if (type == "stream") {
			transcodings.push(
				...(await this.rankTranscodings(
					scTrack.media.transcodings.filter(
						(t) => t.format.protocol == "progressive",
					),
				)),
			);
		}

		for (const transcoding of transcodings) {
			try {
				if (transcoding.format.protocol.includes("hls")) {
					const { data } = await Axios.get<{
						url: string;
						licenseAuthToken?: string;
					}>(
						`${transcoding.url}?client_id=${SCUtils.getClientId()}&track_authorization=${trackAuthorization}`,
					);

					return await this.toHLSProducer(
						data.url,
						scTrack,
						transcoding.format.mime_type,
						data.licenseAuthToken ?? null,
					);
				}

				if (transcoding.format.protocol == "progressive") {
					const { data } = await Axios.get<{
						url: string;
					}>(
						`${transcoding.url}?client_id=${SCUtils.getClientId()}&track_authorization=${trackAuthorization}`,
					);

					return this.toStreamProducer(data.url, transcoding.duration / 1_000);
				}
			} catch (e) {
				console.error(e);
			}
		}

		return null;
	}

	async scan(taskRunContext: TaskRunContext): Promise<void> {
		await SCUtils.waitForConnection();
		const { data } = await Axios.get<Playlist>(
			`https://api-v2.soundcloud.com/playlists/${SOUNDCLOUD_PLAYLIST}?representation=full&client_id=${SCUtils.getClientId()}`,
		);

		taskRunContext.update(0);

		for (let [index, track] of data.tracks.entries()) {
			if (track?.id) {
				if (!track.title) {
					track = await this.cache.getTrack(track.id);
				}
				await this.api.addTrack(
					{
						id: track.id.toString(),
						title: track.title,
					},
					taskRunContext.getRunId(),
				);
				await this.cache.getCache().set(`track:${track.id}`, track);
			}
			taskRunContext.update(index / data.tracks.length);
		}
	}

	async doTracksExist(trackIds: string[]): Promise<string[]> {
		const tracks = await this.cache.resolveTrackList(trackIds);
		return tracks
			.filter((track) => !!track)
			.map((track) => track.id.toString());
	}

	// async scan(taskRunContext: TaskRunContext): Promise<void> {
	// 	await SCUtils.waitForConnection();

	// 	const user = await SoundCloud.users.getUser(
	// 		`https://soundcloud.com/${SOUNDCLOUD_USER}`,
	// 	);

	// 	taskRunContext.update(0);

	// 	return new Promise<void>((resolve, reject) => {
	// 		const total = user.likes_count;
	// 		let trackCount = 0;

	// 		let nextUrl = `https://api-v2.soundcloud.com/users/${user.id}/likes?client_id=${SCUtils.getClientId()}&limit=100`;

	// 		const getChunk = async () => {
	// 			try {
	// 				const { data } = await Axios.get<SoundCloudLikesPage>(nextUrl);

	// 				for (const entry of data.collection) {
	// 					trackCount++;
	// 					if (entry.track?.id) {
	// 						await this.api.addTrack({
	// 							id: entry.track.id.toString(),
	// 							title: entry.track.title,
	// 						});
	// 						await this.cache
	// 							.getCache()
	// 							.set(`track:${entry.track.id}`, entry.track);

	// 						entry.track.media.transcodings[0]?.url;
	// 					}

	// 					taskRunContext.update(trackCount / total);
	// 				}

	// 				if (data.next_href) {
	// 					nextUrl = `${data.next_href}&client_id=${SCUtils.getClientId()}`;
	// 					getChunk();
	// 				} else {
	// 					resolve();
	// 				}
	// 			} catch (e) {
	// 				reject(e);
	// 			}
	// 		};

	// 		getChunk();
	// 	});
	// }
}
