/** Initial theme catalogue (§4). Users can add/remove/rename/disable/reprioritise. */
export interface ThemeDefinition {
  slug: string;
  name: string;
  musicMoods: string[];
  /** Is family/child-sensitive: always human-reviewed, never auto-anything. */
  sensitive?: boolean;
}

export const DEFAULT_THEMES: ThemeDefinition[] = [
  { slug: "fashion", name: "Fashion", musicMoods: ["stylish", "confident", "luxury", "modern"] },
  { slug: "gym", name: "Gym", musicMoods: ["energetic", "aggressive", "motivational"] },
  { slug: "fitness", name: "Fitness", musicMoods: ["energetic", "motivational", "upbeat"] },
  { slug: "career", name: "Career", musicMoods: ["confident", "professional", "ambitious"] },
  { slug: "work", name: "Work", musicMoods: ["focused", "professional", "confident"] },
  { slug: "school", name: "School", musicMoods: ["productive", "youthful", "motivational"] },
  { slug: "family", name: "Family", musicMoods: ["warm", "positive", "emotional"], sensitive: true },
  { slug: "kids", name: "Kids", musicMoods: ["upbeat", "wholesome", "playful"], sensitive: true },
  { slug: "creativity", name: "Creativity", musicMoods: ["artistic", "unusual", "atmospheric"] },
  { slug: "building", name: "Building", musicMoods: ["motivational", "ambitious"] },
  { slug: "entrepreneurship", name: "Entrepreneurship", musicMoods: ["motivational", "ambitious", "confident"] },
  { slug: "technology", name: "Technology", musicMoods: ["modern", "electronic", "focused"] },
  { slug: "projects", name: "Projects", musicMoods: ["motivational", "focused"] },
  { slug: "showing-off", name: "Showing Off", musicMoods: ["confident", "high-energy", "luxury"] },
  { slug: "vanity", name: "Vanity", musicMoods: ["stylish", "attractive", "confident"] },
  { slug: "art", name: "Art", musicMoods: ["cinematic", "atmospheric", "creative"] },
  { slug: "travel", name: "Travel", musicMoods: ["adventurous", "cinematic", "upbeat", "relaxing"] },
  { slug: "lifestyle", name: "Lifestyle", musicMoods: ["chill", "upbeat", "stylish"] },
  { slug: "motivation", name: "Motivation", musicMoods: ["inspirational", "epic", "motivational"] },
  { slug: "accomplishments", name: "Accomplishments", musicMoods: ["triumphant", "confident", "uplifting"] },
  { slug: "cars", name: "Cars", musicMoods: ["high-energy", "confident", "bass-heavy"] },
  { slug: "events", name: "Events", musicMoods: ["upbeat", "celebratory", "energetic"] },
  { slug: "relaxation", name: "Relaxation", musicMoods: ["calm", "chill", "ambient"] },
  { slug: "behind-the-scenes", name: "Behind the Scenes", musicMoods: ["casual", "lo-fi", "playful"] },
  { slug: "personal-growth", name: "Personal Growth", musicMoods: ["reflective", "inspirational", "warm"] },
];

/** Soft weekly rhythm (§23) — a preference, not a schedule. Keys: 0=Sun … 6=Sat. */
export const DEFAULT_WEEKLY_RHYTHM: Record<number, string[]> = {
  1: ["career"],
  2: ["gym"],
  3: ["fashion"],
  4: ["school", "building"],
  5: ["lifestyle"],
  6: ["travel", "family"],
  0: ["creativity", "personal-growth"],
};
