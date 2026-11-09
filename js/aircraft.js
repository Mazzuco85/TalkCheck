// Simplified cabin layouts used to place findings on the cabin map.
// Values are approximate and only used for visual positioning, not for maintenance data.

export const AIRCRAFT = {
  B787: { name: 'Boeing 787', rows: 50, doors: 4 },
  B777: { name: 'Boeing 777', rows: 55, doors: 5 },
  B767: { name: 'Boeing 767', rows: 45, doors: 4 },
  A350: { name: 'Airbus A350', rows: 50, doors: 4 },
  A330: { name: 'Airbus A330', rows: 48, doors: 4 },
  A340: { name: 'Airbus A340', rows: 55, doors: 4 },
};

export const DEFAULT_AIRCRAFT = 'B787';
