/**
 * Doodlr - Curated Built-in Word Bank
 * Categorized words for drawing and guessing.
 */

export const WORD_BANK = {
  animals: [
    'lion', 'elephant', 'giraffe', 'penguin', 'kangaroo',
    'dolphin', 'cheetah', 'octopus', 'squirrel', 'hedgehog',
    'butterfly', 'flamingo', 'chameleon', 'crocodile', 'koala',
    'zebra', 'owl', 'panda', 'gorilla', 'raccoon',
    'hamster', 'peacock', 'platypus', 'walrus', 'seagull',
    'beaver', 'rhino', 'hippopotamus', 'sloth', 'lobster',
    'toucan', 'otter', 'meerkat', 'stingray', 'jellyfish'
  ],
  food: [
    'pizza', 'pancake', 'hamburger', 'spaghetti', 'sushi',
    'waffle', 'taco', 'ice cream', 'burrito', 'chocolate',
    'donut', 'croissant', 'pineapple', 'cupcake', 'sandwich',
    'popcorn', 'watermelon', 'strawberry', 'bagel', 'lasagna',
    'pretzel', 'hotdog', 'avocado', 'blueberry', 'cookie',
    'lollipop', 'omelet', 'muffin', 'noodles', 'dumpling',
    'cheesecake', 'marshmallow', 'cherries', 'nachos', 'bacon'
  ],
  objects: [
    'guitar', 'telescope', 'microscope', 'umbrella', 'compass',
    'hourglass', 'skateboard', 'backpack', 'flashlight', 'teapot',
    'suitcase', 'typewriter', 'saxophone', 'camera', 'sunglasses',
    'anchor', 'lantern', 'parachute', 'binoculars', 'helicopter',
    'alarm clock', 'trophy', 'magnifying glass', 'boomerang', 'candle',
    'kite', 'yo-yo', 'horseshoe', 'padlock', 'lighthouse',
    'stapler', 'scissors', 'thermometer', 'fire hydrant', 'mailbox'
  ],
  places: [
    'lighthouse', 'pyramid', 'castle', 'volcano', 'island',
    'waterfall', 'library', 'stadium', 'cave', 'hospital',
    'desert', 'aquarium', 'jungle', 'skyscraper', 'airport',
    'farm', 'museum', 'cinema', 'spaceship', 'amusement park',
    'beach', 'bridge', 'windmill', 'campsite', 'igloo',
    'harbor', 'observatory', 'zoo', 'planetarium', 'subway station'
  ],
  activities: [
    'swimming', 'skateboarding', 'juggling', 'dancing', 'fishing',
    'camping', 'singing', 'cooking', 'surfing', 'gardening',
    'skiing', 'painting', 'hiking', 'bowling', 'cycling',
    'reading', 'baking', 'climbing', 'archery', 'snorkeling',
    'karate', 'kayaking', 'ice skating', 'juggling', 'magic trick'
  ],
  technology: [
    'robot', 'laptop', 'satellite', 'smartphone', 'rocket',
    'headphones', 'keyboard', 'drone', 'smartwatch', 'battery',
    'printer', 'submarine', 'laser', 'solar panel', 'gamepad',
    'antenna', 'television', 'vr headset', 'walkie talkie', 'server'
  ]
};

/**
 * Get a random sample of words from enabled built-in categories
 * Guarantees distinct words where possible, or safe reduced choices for small pools.
 * @param {string[]} enabledCategories
 * @param {number} [count=3]
 * @param {Set<string>} [recentlyUsed=new Set()]
 * @returns {string[]} Array of distinct words (up to count)
 */
export function getWordChoices(enabledCategories = [], count = 3, recentlyUsed = new Set()) {
  const pool = [];

  // Add words from active categories
  if (Array.isArray(enabledCategories)) {
    for (const cat of enabledCategories) {
      const words = WORD_BANK[cat];
      if (Array.isArray(words)) {
        pool.push(...words);
      }
    }
  }

  // Fallback to all categories if pool is empty
  if (pool.length === 0) {
    for (const cat of Object.keys(WORD_BANK)) {
      pool.push(...WORD_BANK[cat]);
    }
  }

  // Deduplicate pool
  const uniquePool = Array.from(new Set(pool.map((w) => w.trim().toLowerCase())));

  if (uniquePool.length === 0) {
    return ['apple', 'cat', 'house'].slice(0, count);
  }

  // Filter out recently used words if remaining pool size allows
  const filteredPool = uniquePool.filter((w) => !recentlyUsed.has(w));
  const source = filteredPool.length >= count ? filteredPool : (filteredPool.length > 0 ? filteredPool : uniquePool);

  // Shuffle source
  const shuffled = [...source].sort(() => 0.5 - Math.random());
  const selected = [];

  for (const word of shuffled) {
    if (!selected.includes(word)) {
      selected.push(word);
    }
    if (selected.length >= count) break;
  }

  // If three distinct choices are unavailable, return valid reduced number of choices
  return selected;
}
