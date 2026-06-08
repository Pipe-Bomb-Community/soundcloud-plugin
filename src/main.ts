import type PipeBomb from "@sdk";
import { SoundCloudExternalUrlSource } from "./soundcloud.external-url-source.js";
import { SoundCloudLibraryHandler } from "./soundcloud.library-handler.js";
import { TrackIdTrackIdentifier } from "./track-identifier/track-id.track-identifier.js";
import { SoundCloudAttributeSource } from "./soundcloud.attribute-source.js";
import SCUtils from "./util/soundcloud.util.js";
import path from "path";
import { SoundCloudCache } from "./soundcloud-cache.js";
import { ArtistIdTrackIdentifier } from "./track-identifier/artist-id.track-identifier.js";
import { ArtistPermalinkArtistIdentifier } from "./artist-identifier/artist-permalink.artist-identifier.js";
import { AlbumIdTrackIdentifier } from "./track-identifier/album-id.track-identifier.js";
import { ArtistIdAlbumIdentifier } from "./album-identifier/artist-id.album-identifier.js";
import { ISRCTrackIdentifier } from "./track-identifier/isrc.track-identifier.js";
import { EANTrackIdentifier } from "./track-identifier/ean.track-identifier.js";
import { UPCTrackIdentifier } from "./track-identifier/upc.track-identifier.ts.js";
import { SpotifyArtistIdArtistIdentifier } from "./artist-identifier/spotify-id.artist-identifier.js";
import { SoundCloudConfigManager } from "./soundcloud.config-manager.js";
import { WideVine } from "./widevine.js";
import { SoundCloudEphemeralSource } from "./soundcloud.ephemeral-source.js";

export default class Plugin implements PipeBomb.Plugin {
	private api!: PipeBomb.PluginApiContext;
	private logger!: PipeBomb.Logger;

	enable(apiContext: PipeBomb.PluginApiContext) {
		this.api = apiContext;
		this.logger = apiContext.getLogger();

		SCUtils.generateClientId(this.logger);

		this.api.registerLanguageDirectory("language");
		this.api.registerIconDirectory("icons");
		const config = new SoundCloudConfigManager();
		this.api.registerConfigManager(config);

		this.api.requestCacheDirectory().then((cacheDir) => {
			const cache = new SoundCloudCache(path.join(cacheDir, "cache.db"));

			const libraryHandler = new SoundCloudLibraryHandler(
				cache,
				new WideVine(config),
			);

			this.api.registerLibraryHandler(libraryHandler);

			this.api.registerTrackIdentifier(new TrackIdTrackIdentifier());
			this.api.registerTrackIdentifier(new ArtistIdTrackIdentifier(cache));
			this.api.registerTrackIdentifier(new AlbumIdTrackIdentifier(cache));
			this.api.registerTrackIdentifier(new ISRCTrackIdentifier(cache));
			this.api.registerTrackIdentifier(new EANTrackIdentifier(cache));
			this.api.registerTrackIdentifier(new UPCTrackIdentifier(cache));

			this.api.registerArtistIdentifier(
				new ArtistPermalinkArtistIdentifier(cache),
			);
			this.api.registerArtistIdentifier(
				new SpotifyArtistIdArtistIdentifier(cache),
			);
			// todo: implement discogs and youtube etc

			this.api.registerAlbumIdentifier(new ArtistIdAlbumIdentifier(cache));

			const attributeSource = new SoundCloudAttributeSource(cache);
			this.api.registerAttributeSource(attributeSource);

			this.api.registerExternalUrlSource(new SoundCloudExternalUrlSource());

			this.api.registerEphemeralSource(
				new SoundCloudEphemeralSource(libraryHandler, cache, attributeSource),
			);
		});
	}

	disable() {}

	public getLogger() {
		return this.logger;
	}

	public getApi() {
		return this.api;
	}
}
