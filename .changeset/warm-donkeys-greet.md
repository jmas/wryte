---
"@jmas/wryte": minor
---

Inline formatting buttons are now separate by default (bold / italic / strike / spoiler / code each get their own toggle). A new `attributeGroups` option (`string[][]`, default `[]`) — and the matching `groups` element attribute (`groups="bold, italic, strike; spoiler, code"`) — merges attributes into a single cycling button. A group's button steps none → member[0] → member[1] → … → none (skipping disabled members), and `toggleAttribute` of any member cycles the group. The formatting bubble and the default toolbar markup (`defaultToolbarHTML(attributeGroups?)`) both reflect the config. `Editor#attributeGroup(name)` returns an attribute's configured group or null.
