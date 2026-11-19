/**
 * Generates output/sample-booklet.pdf through the same `createBooklet`
 * function the `create_booklet_pdf` MCP tool handler calls.
 * Run: `npm run sample`
 */
import { createBooklet } from "../booklet.js";

const markdown = `# The Tawny Owl

The tawny owl is a bird of quiet woods and long dusks. It does not announce itself the way a blackbird does at dawn. Instead it waits for the light to thin, for the edges of the trees to soften, and then it begins to speak in a voice that seems to come from everywhere and nowhere at once. To hear a tawny owl is to understand that the night has its own kind of daylight, one measured in sound rather than sight.

Its plumage is a study in browns. Tawny, russet, and grey-brown feathers lie over one another in soft scallops, each feather edged a little darker than its centre, so the whole bird looks like bark that has learned to breathe. From a distance it disappears against an oak trunk. Up close, the pattern resolves into fine streaks and bars, and the round face, framed by its pale facial disc, looks out with dark, deep-set eyes that seem far older than the bird itself.

Unlike the barn owl, whose face is shaped like a heart, the tawny owl wears a round disc, split faintly down the middle into two soft lobes. There are no ear tufts. The beak is short and hooked, and mostly buried in feathers, with only the dark tip showing. It is a face built for listening as much as for seeing, and the bird turns its head with a slow, deliberate care that makes every movement feel considered.

---

# At Dusk

Dusk is the tawny owl's morning. As the last light leaves the field, the owl wakes in its roost, shakes out its wings, and tests the air. The first flight of the evening is rarely far. It glides from one familiar branch to another, landing with a softness that seems impossible for a bird of its size, talons closing around the bark without a sound.

Food is found by ear. A field mouse moving through dry grass makes a rustle so faint that a person standing nearby would miss it entirely, but the owl hears it as clearly as a footstep on gravel. Its ears are set unevenly, one slightly higher than the other, so the sound arrives at each ear at a slightly different time. From that tiny difference the owl builds a map of the dark, and it can strike at prey it has never seen.

The hunt itself is a study in patience. The owl will sit for long minutes on a low branch, turning its head in slow arcs, listening. When it moves, it moves all at once, dropping from the branch in a silent glide, wings spread wide, and then it is gone into the grass. More often than not it returns to the branch with something small and warm in its talons, and the evening continues.

---

# A Quiet Flight

To watch a tawny owl fly is to watch silence take shape. The leading edge of each wing is fringed with soft, comb-like feathers that break the air into small, quiet streams instead of letting it rush and whistle. The trailing edge is soft as well, and the whole wing seems to absorb sound rather than make it. Other birds beat the air. The owl seems to part it, gently, and let it close behind.

This silence is not a trick. It is the bird's livelihood, and it is also its gift to the woods. A silent hunter does not scatter the night. The mice keep moving, the voles keep rustling, and the owl keeps listening. The forest at night is a conversation held in whispers, and the owl is both the listener and the question at the end of it.

If you walk a woodland edge on a still autumn evening, stand quietly for a while and listen. You may hear the classic call, a long trembling hoot that rises and falls like a breath held and released. Answer it softly, if you like, with a low whistle of your own. Sometimes the owl will answer back, and for a moment the dark will feel a little less empty, and a little more like home.

---

# The Owl in Winter

Winter changes the tawny owl's world without changing the owl. The trees stand bare, the field lies white, and every sound carries further in the cold air. The owl's brown feathers, so perfect against summer bark, now stand out against the snow, and so the bird keeps to the evergreens and the dark hollows of old oaks, where shadow still gathers thick enough to hide in.

Food grows scarce, and the owl grows bolder. It will hunt in the grey hours of late afternoon, when the light is thin but the mice are still moving under the snow. It listens for the faint crunch of a vole tunnelling beneath the crust, and when it strikes, it must break through the snow itself, wings beating once, twice, to lift clear again. Some winters are hard, and not every owl survives them, but the ones that do emerge in spring with a patience that seems carved into them.

The cold also brings the owls together. In the deep winter months, tawny owls call to one another across the valley, male and female answering back and forth, marking the boundaries of the ground they will defend when spring comes. The calls carry for miles on still nights, and a person standing in a garden can hear a whole conversation unfolding in the dark, a map of territories drawn entirely in sound.

---

# Listening for Owls

You do not need special equipment to listen for a tawny owl. You need a quiet evening, a place near trees, and the willingness to stand still for longer than feels natural. The owl's call is often the first sound of the night, beginning just as the blackbirds fall silent, and it is easy to mistake for something else until you have heard it twice.

The classic call is the male's, a long hoot that trembles in the middle, like a note played on a flute by a hand that is not quite steady. The female answers with a sharper, shorter call, a quick kew-wick that sounds almost like a question. Together they form a duet that has been performed in these woods for longer than anyone has been listening, and it loses none of its strangeness for being familiar.

If you hear nothing on your first evening, try again on the next. Owls are not on a schedule made for people, and a silent night tells you nothing at all. The bird may be hunting far away, or sitting quietly in its roost, or simply watching you from a branch you have not thought to look at. The listening is the point. Stand still, breathe slowly, and let the night come to you.

---

# The Nest

Tawny owls do not build nests. They borrow them, taking over a hollow tree, an old crow's nest, or a quiet corner of a barn, and making it their own by the simple act of staying. The female lays her eggs on whatever the hollow already holds, a bed of dead leaves and old feathers, and she sits on them through the cold weeks of early spring while the male brings her food in the dark.

The young owls hatch covered in white down, blind and helpless, and for the first weeks of their lives they know the world only as warmth and the sound of their parents. Then their eyes open, dark and enormous, and they begin to peer over the edge of the hollow at a world that is far bigger than they imagined. They grow quickly, and by midsummer they are out on the branches, flapping and stumbling, learning the air one short flight at a time.

By autumn the young owls must leave. The woods can hold only so many tawny owls, and the parents, who fed them so patiently all summer, will drive them away with sharp calls and sharper talons. It seems unkind, but it is the only way the young birds will ever find ground of their own. They disperse into the dark, one by one, and the woods grow quiet again, waiting for winter.
`;

async function main(): Promise<void> {
  const result = await createBooklet({
    title: "The Little Book of Owls",
    subtitle: "A short field guide for curious readers",
    author: "Drew",
    markdown,
    filename: "sample-booklet.pdf",
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
