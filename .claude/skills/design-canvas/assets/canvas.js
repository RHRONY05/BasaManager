// Design canvas manifest — read by canvas.html and scripts/shoot.mjs.
// Keep groups and screens in user-flow order. Paths are relative to this folder.
// status: "draft" | "review" | "changes" | "approved"   (only the user approves)
window.CANVAS = {
  title: "[Project] UI",
  themes: ["light"], // add "dark" if the tokens define [data-theme="dark"]
  groups: [
    {
      id: "kit",
      title: "Component kit",
      screens: [
        { file: "screens/_kit/components.html", title: "Kit · Components & states", w: 1440, h: 2200, status: "draft" }
      ]
    }
    // {
    //   id: "guest",
    //   title: "Guest — phone",
    //   screens: [
    //     { file: "screens/guest/home.html", title: "G1 · Home", w: 390, h: 844, status: "draft",
    //       note: "Motion: list stagger 40ms on first load." }
    //   ]
    // }
  ]
};
