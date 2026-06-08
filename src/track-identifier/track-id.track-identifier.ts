import {
	IdentifierDependency,
	TrackIdentifier,
	TrackIdentifierTarget,
	TrackInformationHelper,
} from "@sdk";

export class TrackIdTrackIdentifier implements TrackIdentifier {
	public readonly target: TrackIdentifierTarget = "track";
	public readonly id = "soundcloud_track_id";

	async identify(helper: TrackInformationHelper): Promise<string[] | null> {
		if (helper.getPluginId() != "soundcloud") {
			return null;
		}

		return [helper.getTrackId()];
	}

	getDependencies(): IdentifierDependency[] {
		return [];
	}

	getSoftDependencies(): IdentifierDependency[] {
		return [];
	}
}
