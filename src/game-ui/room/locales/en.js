/* 房间（多人）那层共用的文案。各个游戏把它并进自己的语言包：

     createI18n({ packs: { en: { ...en, ...roomEn }, "zh-CN": { ...zh, ...roomZh } } })

   合并就是顶层展开 —— 共用文案自成 room.* 一棵子树，不会和游戏的 ui.* 打架。 */

export default {
  room: {
    label: "Room {code}",
    meta: "Level {level}/{levels} · {here} on this level · {room} in the room",
    people: "{n} in the room",
    lead: "Everyone plays their own run here — nobody starts or stops together. Press Start and you begin at level 1 of {levels}; anyone on the same level as you shows up on the tower.",
    onLevel: "On level {n}",
    notStarted: "has not started yet",
    finishedAll: "every level done",
    invite: "Copy invite link",
    invited: "Link copied",
    leave: "Leave",
    yourName: "Your name",
    nameFromLink: "This name came from the link you opened — it cannot be changed here",
    start: "Start",
    finishLine: "finish",
    you: "(you)",
  },
};
