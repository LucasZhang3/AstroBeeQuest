export interface Scene {
  sceneNumber: number;
  promptText: string;
  characterLimit: number;
}

export type SkinId = 'dungeon' | 'space' | 'wasteland' | 'heist' | 'odyssey';

export interface Skin {
  id: SkinId;
  name: string;
  description: string;
  scenes: Scene[];
}

const CHARACTER_LIMIT = 500;

function makeScenes(prompts: string[]): Scene[] {
  return prompts.map((promptText, i) => ({
    sceneNumber: i + 1,
    promptText,
    characterLimit: CHARACTER_LIMIT,
  }));
}

export const skins: Record<SkinId, Skin> = {
  dungeon: {
    id: 'dungeon',
    name: 'Classic Dungeon',
    description: 'A tabletop dungeon crawl through Astrobee\'s Emporium',
    scenes: makeScenes([
      "You find yourself at the entrance of a vast dungeon. The air is thick with anticipation. A weathered sign reads 'Astrobee's Emporium - All Who Enter Shall Be Known.' What draws you to step inside?",
      "The corridor splits into three paths: one lit by flickering torches, one shrouded in complete darkness, and one where distant laughter echoes. How do you decide which path to take?",
      "You encounter a wounded traveler who claims to know a shortcut, but something in their eyes seems uncertain. How do you respond to their offer of guidance?",
      "A locked chest sits before you, covered in mysterious runes. Nearby, a riddle is carved into the stone. Do you solve the puzzle, force the lock, or move on?",
      "Your party faces a moral dilemma: save the village by sacrificing an ancient artifact, or keep the artifact and risk the villagers' fate. What matters most to you in this moment?",
      "A rival adventurer challenges you to a contest of skill. Victory promises glory, but defeat could damage your reputation. How do you approach competition?",
      "The dungeon master introduces a twist that completely changes your carefully laid plans. How do you adapt when the unexpected upends your strategy?",
      "You discover a hidden library filled with forbidden knowledge. Reading the texts could grant power, but at what cost? What drives your thirst for understanding?",
      "A companion in your party makes a decision you strongly disagree with. The tension is palpable. How do you navigate conflict within your group?",
      "You find a magical item of immense power, but it's clearly meant for another class. Do you keep it, trade it, or give it freely? What guides your choices about resources?",
      "The final boss offers you a deal: join them and rule together, or face almost certain defeat in battle. What principles guide you in moments of ultimate choice?",
      "The adventure ends, and you sit with your companions recounting the journey. What moment defined you? What would you do differently? What does this story reveal about who you are at the table?",
    ]),
  },

  space: {
    id: 'space',
    name: 'Deep Space Expedition',
    description: 'A generation ship crew exploring uncharted space',
    scenes: makeScenes([
      "You wake from cryo-sleep aboard the generation ship Meridian, light-years from Earth. The recruitment holo plays on loop: 'Volunteers needed for humanity's farthest journey.' Why did you sign up?",
      "Three signal sources appear on long-range scanners: a habitable planet with faint life signs, a derelict alien vessel drifting silently, and an energy anomaly inside a nebula. Which do you investigate first, and why?",
      "A stowaway is discovered in the cargo bay. They claim to be an engineer who can repair the failing atmospheric processors. Their credentials check out, but they lied to get aboard. Do you trust them?",
      "An encrypted alien transmission is intercepted. The linguistics AI offers three approaches: brute-force decryption that could corrupt the data, slow pattern analysis that may take weeks, or broadcasting a reply blind. How do you proceed?",
      "A distress beacon reveals a stranded colony on a nearby moon. Diverting fuel to rescue them means your own crew may not reach the next refueling point. What do you decide, and what drives that choice?",
      "A rival officer publicly questions your command decision during a bridge briefing, calling it reckless. The crew watches. How do you handle the challenge to your authority?",
      "Mid-transit through a wormhole, gravitational shear scrambles your navigation systems. Your plotted course is gone, and you have minutes before the window collapses. How do you adapt?",
      "Deep in an alien archive, you find data that could leap human science forward by centuries. But accessing the core triggers a station-wide quarantine lockdown. Is the knowledge worth the risk?",
      "Your co-pilot refuses to execute a course correction you believe is critical, citing their own analysis. Neither of you can prove the other wrong. How do you navigate the standoff?",
      "You recover a piece of advanced alien technology clearly designed for the engineering department, not your division. It could give you a significant personal advantage. Do you keep it, trade it, or hand it over?",
      "The alien intelligence you've been communicating with offers peaceful coexistence and shared knowledge — if you surrender the ship's weapons array. No weapons means no defense against unknowns. What do you choose?",
      "Back on Earth, seated in the debriefing room. The panel asks: 'What defined you out there?' Looking back on every decision, every crisis — what does this journey reveal about the person you are?",
    ]),
  },

  wasteland: {
    id: 'wasteland',
    name: 'Post-Apocalyptic Wasteland',
    description: 'A lone wanderer navigating a world after the fall',
    scenes: makeScenes([
      "The old world ended three years ago. Most people settled into camps, but you keep moving. As you stand at the edge of another dead city, ask yourself: why do you travel instead of staying put?",
      "Three routes cut through the ruins ahead: a highway overpass exposed but fast, a flooded subway tunnel that's dark and winding, and a detour through an abandoned market where you hear distant voices. Which do you take?",
      "At your campfire, a stranger stumbles in — injured, unarmed, claiming they were robbed. They say they know where a clean water source is and will share the location if you help them. How do you respond?",
      "You find a sealed bunker door with a mechanical combination lock. Scratched into the wall nearby are faded clues left by a previous survivor. Do you work through the clues, try to force the door, or move on?",
      "A small settlement is running out of medicine. You have enough antibiotics for yourself for the next month, or enough to save their sick if you give it all away. What do you do, and why?",
      "Another scavenger claims the supply cache you just found is on their territory. They're armed and aggressive, but you got here first. How do you handle the dispute?",
      "A sudden dust storm destroys your shelter and scatters your supplies across the wasteland. Everything you planned for the next week is gone. How do you respond?",
      "In a collapsed library basement, you find intact pre-war hard drives — history, science, literature, all preserved. Carrying them will slow you down and make you a target. Is the knowledge worth the burden?",
      "Your traveling companion wants to head north toward rumored safe zones. You believe going east to the coast is smarter. Neither of you wants to travel alone. How do you resolve it?",
      "You discover a stash of critical medication clearly labeled for a specific person at a nearby settlement — someone you've never met. It would also save your own life if your condition worsens. What do you do?",
      "A warlord controlling the only mountain pass offers you safe passage and protection in exchange for joining their outfit. Refuse, and you face the wilds alone. What guides your decision?",
      "Night falls, and you sit by the fire reflecting on the road behind you. What moment in this broken world defined who you've become? What would you do differently? What has survival revealed about you?",
    ]),
  },

  heist: {
    id: 'heist',
    name: 'Heist Crew',
    description: 'An elite crew pulling off a high-stakes operation',
    scenes: makeScenes([
      "The fixer slides a dossier across the table. The job: a vault beneath the most secure building in the city. The payout is life-changing. But every crew member has their own reason for being here. What's yours?",
      "The blueprints show three entry points: the rooftop — exposed but direct, a maintenance tunnel — cramped and risky, or through the lobby disguised as staff — slow but hidden in plain sight. Which do you choose?",
      "An informant offers inside intel on the security rotation. Their information has been reliable before, but this time something feels off — they're too eager. Do you trust the tip?",
      "The vault door requires cracking a multi-layered security puzzle: biometrics, a rotating cipher, and a physical key. You can attempt a technical bypass, social-engineer a guard for access, or find a brute-force workaround. How do you approach it?",
      "Mid-job, you discover an innocent night-shift worker locked in a supply closet — they've seen your faces. Letting them go risks the whole operation. Keeping them endangers their safety. What do you decide?",
      "You learn a rival thief is hitting the same target tonight. If you race them, mistakes happen. If you coordinate, you split the take. How do you handle the competition?",
      "An alarm triggers that wasn't in the plan. Guards are mobilizing, your exit route is compromised, and the crew is looking to you. The plan has gone sideways. What do you do next?",
      "While inside the mark's office, you stumble on files containing secrets — corporate fraud, political blackmail, evidence of crimes. The data is worth more than the vault's contents. Do you take it, and what would you do with it?",
      "One crew member goes off-script during a critical phase, improvising a move that endangers the timeline. You disagree with their call, but there's no time for debate. How do you handle it?",
      "In the vault, you find an extra cache of valuables clearly earmarked for another crew's job. Taking it would be a bonus, but it could start a war with another outfit. What do you do?",
      "The mark corners you and makes an offer: walk away now with a generous cut, no charges, no heat — but your crew gets nothing. Refuse, and the full weight of their security comes down. What's your answer?",
      "The crew gathers at the safe house after the job. Adrenaline fading, everyone processes what happened. What moment during the heist defined you? What would you do differently? What did this reveal about who you really are under pressure?",
    ]),
  },

  odyssey: {
    id: 'odyssey',
    name: 'Mythic Odyssey',
    description: 'A hero\'s journey through ancient myth and legend',
    scenes: makeScenes([
      "The oracle speaks your name and declares your fate: a journey to the edge of the known world. Heroes before you have answered the call for glory, duty, or redemption. What compels you to leave everything behind?",
      "The path forks at the Crossroads of Three Realms: the Sunlit Sea with its treacherous sirens, the Frost Mountain where giants keep ancient secrets, or the Underworld Gate where the dead whisper truths. Which do you choose?",
      "A trickster god appears in disguise, offering a shortcut through the Enchanted Forest. Their help has come at a cost for every hero before you, yet the path ahead without them is perilous. Do you accept their guidance?",
      "A sphinx blocks the bridge to the next realm. It offers a riddle — solve it and pass freely, answer wrong and face its wrath. You could also attempt to sneak past or challenge it to combat. How do you proceed?",
      "The gods demand a sacrifice: surrender the divine gift you were given at birth to save a village of mortals from a plague. Without it, your power diminishes. With it, innocents die. What do you choose?",
      "A demigod challenges you to a trial of strength at the Festival of Heroes. Victory earns a legendary weapon; defeat brings shame before the gathered kingdoms. How do you approach the contest?",
      "Zeus reshapes the landscape mid-journey — mountains rise where plains were, rivers reverse course. Your carefully planned route is meaningless. The gods have changed the rules. How do you adapt?",
      "In a forbidden temple, you discover scrolls containing knowledge of the gods' weaknesses. Reading them grants immense power but marks you as an enemy of Olympus. Is the knowledge worth divine wrath?",
      "Your sworn companion — bonded by oath since the journey began — defies your decision at a critical moment, choosing mercy where you chose justice, or vice versa. The rift is deep. How do you navigate it?",
      "You find a legendary weapon forged by Hephaestus, but it was crafted for another hero's prophecy. Wielding it could upset the balance of fate. Do you claim it, return it, or destroy it?",
      "The Titan lord offers a bargain: join the old powers and reshape the world as you see fit, or face the final battle against impossible odds with only your mortal companions. What principles guide your choice?",
      "You return home, weathered and changed. Seated around the hearth, the bards ask for your story. What moment in the odyssey defined the hero you became? What would you do differently? What has myth revealed about the mortal beneath?",
    ]),
  },
};

// Convenience: default scenes export for backward compatibility
export const scenes = skins.dungeon.scenes;

// Ordered list for the selection UI
export const skinList: Skin[] = [
  skins.dungeon,
  skins.space,
  skins.wasteland,
  skins.heist,
  skins.odyssey,
];
