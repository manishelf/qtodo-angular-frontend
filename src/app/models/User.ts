export interface User {
    alias: string | null;

	email: string;

	userGroup: string;

	password?: string;

	profilePicture?: string;

    token?: string;

	preferences? : {
		theme?: string,
		hideChildren?: boolean,
	}

	permissions? : string[];

	onlineInUg?: boolean;
}