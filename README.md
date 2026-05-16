<p align="center">
  <img src="public/logo.png" alt="Astrobee's Emporium" width="120" />
</p>

<h1 align="center">Astrobee's Emporium</h1>

<p align="center">
  Discover your D&D player archetype through immersive storytelling.
</p>



## About

Most D&D player-type quizzes reduce your playstyle to a series of checkbox clicks. Astrobee's Emporium takes a different approach.

You're placed into **12 atmospheric scenarios** - a dungeon corridor, a deep-space hull breach, a post-apocalyptic wasteland - and asked to describe what you'd do in your own words. The system analyzes behavioral signals across ten psychological axes and produces a detailed breakdown of your player identity across eight archetypes.

Your words reveal your playstyle, not your multiple-choice answers.



## The Eight Archetypes

| Archetype     | Description                                                                 |
|---------------|-----------------------------------------------------------------------------|
| Actor         | Lives inside the character - accent, mannerisms, and all                   |
| Explorer      | Drawn to the unknown - every locked door is an invitation                  |
| Instigator    | Stirs the pot - chaos is just another word for opportunity                 |
| Power Gamer   | Optimizes everything - builds, combos, action economy                      |
| Slayer        | Lives for the fight - initiative is the best part of the game              |
| Storyteller   | Weaves the narrative - every session is a chapter                          |
| Thinker       | Solves the puzzle - logic and strategy above all                           |
| Watcher       | Savors the experience - the journey matters more than the destination      |



## How It Works

1. **Choose your world** - Pick from five thematic settings
2. **Explore 12 scenes** - Respond to immersive narrative prompts in your own words
3. **Discover your profile** - Receive a personalized archetype breakdown

The scoring engine is fully deterministic - identical responses always produce identical results. Archetype percentages are calculated across ten behavioral axes and always sum to exactly 100%.


## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/efab5ade-65d0-4a06-be77-bd7bb6618dd4" alt="Landing Page" width="720" />
</p>
<p align="center"><em>Landing Page</em></p>

<br />

<p align="center">
  <img src="https://github.com/user-attachments/assets/d08449b1-8fb9-43f0-a5c2-d249bd011eec" alt="Choose Your World" width="720" />
</p>
<p align="center"><em>Choose Your World</em></p>

<br />

<p align="center">
  <img src="https://github.com/user-attachments/assets/4b5f6c65-093a-4137-9a20-05c333f0402f" alt="Scene Prompt" width="720" />
</p>
<p align="center"><em>Responding to a Scene</em></p>

<br />

<p align="center">
  <img src="https://github.com/user-attachments/assets/b221b279-f449-4c33-a45c-c052b09c3e3b" alt="Archetype Results 1" width="700" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/c5d41302-3110-4bbd-a313-b2a7b14aece7" alt="Archetype Results 2" width="700" />
</p>

<p align="center"><em>Your Archetype Breakdown</em></p>

## Features

- **5 Thematic Worlds** - Classic Dungeon, Deep Space, Post-Apocalyptic, Heist, Mythic Odyssey
- **Freeform Storytelling** - No checkboxes, just natural language
- **Behavioral Analysis** - Signals across 10 psychological axes
- **Visual Results** - Radial orbital visualization with ranked archetypes
- **Privacy-First** - Anonymous sessions, optional email, no tracking
- **Cinematic Design** - Animated backgrounds, smooth transitions, dark-mode aesthetic
- **Fully Responsive** - Works on desktop and mobile



## Getting Started

```bash
git clone https://github.com/YOUR_USERNAME/astrobees-emporium.git
cd astrobees-emporium
npm install
npm run dev
```

The scoring engine requires a configured backend. See the [Setup Guide](docs/SETUP.md) for full deployment instructions.



## Project Structure

```
src/
  components/       UI components
  data/             Scene definitions and content
  hooks/            Custom React hooks
  lib/scoring/      Deterministic scoring engine
  pages/            Route pages

supabase/
  functions/        Backend functions (scoring, bypass)
  migrations/       Database schema

docs/               Technical documentation
```



## Documentation

| Document | Description |
|-|-|
| [Technical Overview](docs/TECHNICAL.md) | Architecture, database schema, and system design |
| [Scoring Engine](docs/SCORING.md) | How the deterministic scoring algorithm works |
| [Scoring Engine Details](docs/scoring-engine.md) | Deep dive into the math behind archetype classification |
| [Setup Guide](docs/SETUP.md) | How to deploy your own instance |



## Contributing

Contributions are welcome. To get started:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a pull request

Small, focused pull requests are preferred. Please review existing issues before starting new work.

**Areas where help is welcome:**

- Visual polish - animations, transitions, responsive refinements
- Scene writing - new scenarios, prompt improvements, tone refinement
- Accessibility - contrast, screen readers, keyboard navigation
- Localization - translations for non-English players
- Testing - integration tests, edge-case coverage



## Roadmap

- Shareable results cards for social media
- Additional scene packs and community-contributed themes
- Accessibility audit (WCAG AA)
- Multiplayer party profiles
- Visual result export



## License

This project is open source. See [LICENSE](LICENSE) for details.
