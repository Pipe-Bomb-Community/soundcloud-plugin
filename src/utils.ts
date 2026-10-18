import { AttributeValue } from "@pipe-bomb/plugin-sdk";

export function compare<T extends string | number>(a: T, b: T) {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

export function toDateAttributes(date: Date): AttributeValue[] {
	let monthString = (date.getMonth() + 1).toString();
	if (monthString.length < 2) {
		monthString = `0${monthString}`;
	}

	let dateString = date.getDate().toString();
	if (dateString.length < 2) {
		dateString = `0${dateString}`;
	}

	return [
		{
			key: "year",
			value: date.getUTCFullYear(),
		},
		{
			key: "release_timestamp",
			value: date.getTime(),
		},
		{
			key: "release_date",
			value: `${date.getFullYear()}-${monthString}-${dateString}`,
		},
	];
}
