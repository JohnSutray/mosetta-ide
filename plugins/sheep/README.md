# Sheep

**`@mosetta/ide-plugin-sheep`** · Pixel sheep grazing in an empty editor.

## What it does

When no file is open, the middle of the IDE is not grey emptiness with an apology: it is
a pasture with two huts. Open its gate and sheep wander in. Pick one up with the mouse and
drop it into a hut: two sheep dropped into the barn come out as one bigger sheep, and a
sheep dropped into the other hut comes out shorn. The signs above the huts say so in
pictures, and a counter keeps score of how many merged and how many were shorn. Close the
gate again if the movement distracts you.

This is a joke with a principle behind it: an interface should have a face, and an empty
panel should say what it is. It is also an optional ornament — one line in
`settings.json` switches it off, and the editor then says in words that nothing is open.

## Screenshots and demos

![The pasture in an empty editor](https://ide.mosetta.org/media/sheep/shot.png)

![The pasture opening and the sheep wandering in](https://ide.mosetta.org/media/sheep/demo.gif)

[Watch the video](https://ide.mosetta.org/media/sheep/demo.mp4) · [Try it in the browser](https://ide.mosetta.org/#demo)

## Using it from another plugin

The whole plugin is one entry in the editor's `editor.empty` key:

```ts
this.ide.registry('editor.empty').add({ id: 'sheep', view: () => <SheepField /> });
```

Want a different empty editor — recent files, a tip of the day, a clock? Add your own
entry and switch this plugin off.
