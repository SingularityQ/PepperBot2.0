import * as action from "../lib/discord_action.js";
import {
    Command,
    CommandData,
    SubCommand,
    SubCommandData,
} from "../lib/types/commands.js";
import {
    Collection,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ComponentType,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import fs from "fs";
import fsextra from "fs-extra";
import * as log from "../lib/log.js";
import * as globals from "../lib/globals.js";
import * as files from "../lib/files.js";
import * as theme from "../lib/theme.js";
import { AdvancedPagedMenuBuilder } from "../lib/types/menuBuilders.js";

const config = globals.config;

class listValue {
    constructor(name, value, checked) {
        this.name = name;
        this.value = value;
        this.completed = checked;
    }
}

function createListFiles(id, name) {
    fsextra.ensureDirSync(`resources/data/todos/${id}`);
    fsextra.ensureFileSync(
        `resources/data/todos/${id}/${files.fixFileName(name)}.json`
    );

    fs.writeFileSync(
        `resources/data/todos/${id}/${files.fixFileName(name)}.json`,
        JSON.stringify([])
    );

    return `resources/data/todos/${id}/${files.fixFileName(name)}.json`;
}
function ensureList(id, name) {
    if (
        !fs.existsSync(
            `resources/data/todos/${id}/${files.fixFileName(name)}.json`
        )
    ) {
        return createListFiles(id, name);
    }
    return `resources/data/todos/${id}/${files.fixFileName(name)}.json`;
}
function readList(id, name) {
    return JSON.parse(
        fs.readFileSync(
            `resources/data/todos/${id}/${files.fixFileName(name)}.json`
        )
    );
}
function editList(id, name, key, value, checked) {
    const list = readList(id, name);
    list[key] = new listValue(key, value, checked);
    fs.writeFileSync(
        `resources/data/todos/${id}/${files.fixFileName(name)}.json`,
        JSON.stringify(list, null, 4)
    );
}
function removeListItem(id, name, key) {
    const list = readList(id, name);
    list.splice(key, 1);
    fs.writeFileSync(
        `resources/data/todos/${id}/${files.fixFileName(name)}.json`,
        JSON.stringify(list, null, 4)
    );
}
let latestEmbeds = {};
let whichListForUser = {};
const buttons = {
    add: new ButtonBuilder()
        .setCustomId("add")
        .setLabel("📥 Add")
        .setStyle(ButtonStyle.Success),
    remove: new ButtonBuilder()
        .setCustomId("remove")
        .setLabel("❌ Remove")
        .setStyle(ButtonStyle.Danger),
    check: new ButtonBuilder()
        .setCustomId("check")
        .setLabel("✅ Check")
        .setStyle(ButtonStyle.Primary),
    switch: new ButtonBuilder()
        .setCustomId("switch")
        .setLabel("🔄 Switch")
        .setStyle(ButtonStyle.Secondary),
};
const ActionRow = new ActionRowBuilder().addComponents(
    buttons.add,
    buttons.remove,
    buttons.check,
    buttons.switch
);

async function refresh(authorId, gconfig) {
    const latestEmbed = latestEmbeds[authorId];
    if (!latestEmbed) return;
    if (latestEmbed.menu) {
        latestEmbed.menu.full.stop();
    };
    const whichList = whichListForUser[authorId] || "main";
    const l = ensureList(authorId, whichList);
    const list = readList(authorId, whichList);
    const menu = latestEmbed.menu || new AdvancedPagedMenuBuilder();
    let listChunks = [];
    let chunk = [];
    let currentIndexCount = 0
    list.forEach((item, index) => {
        chunk.push(`${item.completed ? "✅~~" : ""}[${index + 1}] - ${item.value}${item.completed ? "~~" : ""}`);
        if (currentIndexCount === 14) {
            listChunks.push(chunk);
            chunk = [];
            currentIndexCount = 0;
        }
        currentIndexCount++
    });
    if (currentIndexCount !== 0 && chunk.length !== 0) {
        listChunks.push(chunk);
    }
    menu.full.pages = [];
    listChunks.forEach((chunk, pageIndex) => {
        if (chunk.length === 0) return;
        const embed = theme.createThemeEmbed(theme.themes[gconfig.theme] || theme.themes.CURRENT)
            .setTitle(`${latestEmbed.executedMessage.author.username}'s "${whichList}" (page ${pageIndex + 1}/${listChunks.length})`)
            .setDescription(chunk.join("\n"));
        menu.full.addPage(embed);
    });
    const noItemsEmbed = theme.createThemeEmbed(theme.themes[gconfig.theme] || theme.themes.CURRENT)
        .setTitle(`${latestEmbed.executedMessage.author.username}'s "${whichList}"`)
        .setDescription("there aren't any items in this list");
    let embed = menu.full.pages[0] || noItemsEmbed
    let components = [ActionRow];
    if (embed !== noItemsEmbed) {
        components = [ActionRow, menu.actionRow];
    }

    const sent = await action.editMessage(latestEmbed.message, {
        embeds: [embed],
        components: components,
        ephemeral: gconfig.useEphemeralReplies,
        content: "viewing todo list: " + whichList,
    });

    menu.full.begin(sent, 1200_000, menu);
    latestEmbeds[authorId].menu = menu;

    return sent;
}

const whichData = new SubCommandData();
whichData.setName("which");
whichData.setDescription("displays which list you are currently editing");
whichData.setPermissions([]);
whichData.setPermissionsReadable("");
whichData.setWhitelist([]);
whichData.setCanRunFromBot(true);
whichData.setAliases(["current"]);

const which = new SubCommand(
    whichData,
    async function getArguments(message) {
        return new Collection();
    },
    async function execute(message, args, fromInteraction, gconfig, isButton) {
        const whichList = whichListForUser[message.author.id] || "main";
        action.reply(message, {
            content: `currently editing list "${whichList}"`,
            ephemeral: gconfig.useEphemeralReplies,
        });
    }
);

const switchData = new SubCommandData();
switchData.setName("switch");
switchData.setDescription("switches your current list to another list");
switchData.setPermissions([]);
switchData.setPermissionsReadable("");
switchData.setWhitelist([]);
switchData.setCanRunFromBot(true);
switchData.setAliases(["change"]);
switchData.addStringOption((option) =>
    option
        .setName("content")
        .setDescription("which list to switch to")
        .setRequired(true)
);

const switchc = new SubCommand(
    switchData,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set(
            "content",
            message.content
                .slice(prefix.length + commandLength)
                .trim()
        );
        return args;
    },
    async function execute(message, args, fromInteraction, gconfig, isButton) {
        if (!args.get("content")) {
            action.reply(message, {
                content: "you need to supply a list to switch to",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        if (args.get("content") === "ls") {
            const fileList = await files.generateLSText(
                `resources/data/todos/${message.author.id}`,
                true
            );
            const fileListWithoutExtensions = fileList.replace(/\.[^.]+$/, "");
            const file = await files.textToFile(
                fileListWithoutExtensions,
                "todolists_" + message.id
            );
            action.reply(message, {
                files: [{ attachment: file, name: "todolists_" + message.id + ".txt" }],
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        const oldWhichList = whichListForUser[message.author.id] || "main";
        const oldList = readList(message.author.id, oldWhichList);
        const oldListLength = oldList.length;
        let content = "";
        if (oldListLength === 0 && oldWhichList !== "main") {
            fs.unlinkSync(
                `resources/data/todos/${message.author.id}/${files.fixFileName(
                    oldWhichList
                )}.json`
            );
            content += `deleted old list "${oldWhichList}" as it contained no entries. `;
        }

        whichListForUser[message.author.id] = args.get("content");
        ensureList(message.author.id, args.get("content"));
        refresh(message.author.id, gconfig);
        content += `switched to list "${args.get("content")}"`;
        action.reply(message, {
            content: content,
            ephemeral: gconfig.useEphemeralReplies,
        });
    }
);

const addTaskData = new SubCommandData();
addTaskData.setName("add");
addTaskData.setDescription("adds a task to your todo list");
addTaskData.setPermissions([]);
addTaskData.setPermissionsReadable("");
addTaskData.setWhitelist([]);
addTaskData.setCanRunFromBot(true);
addTaskData.addStringOption((option) =>
    option
        .setName("content")
        .setDescription("content to add to your list")
        .setRequired(true)
);

const addTask = new SubCommand(
    addTaskData,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set(
            "content",
            message.content
                .slice(prefix.length + commandLength)
                .trim()
        );
        return args;
    },
    async function execute(message, args, fromInteraction, gconfig, isButton) {
        if (!args.get("content")) {
            action.reply(message, {
                content: "you need to supply an item to add to the list",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        const whichList = whichListForUser[message.author.id] || "main";
        const list = ensureList(message.author.id, whichList);
        const listLength = readList(message.author.id, whichList).length;
        await editList(
            message.author.id,
            whichList,
            listLength,
            args.get("content"),
            false
        );
        refresh(message.author.id, gconfig);
        if (isButton) {
            message.deferUpdate();
            return;
        }
        action.reply(message, {
            content: `added ${args.get("content")} to list "${whichList}"`,
            ephemeral: gconfig.useEphemeralReplies,
        });
    }
);

const removeTaskData = new SubCommandData();
removeTaskData.setName("remove");
removeTaskData.setDescription("removes a task from your todo list");
removeTaskData.setPermissions([]);
removeTaskData.setPermissionsReadable("");
removeTaskData.setWhitelist([]);
removeTaskData.setCanRunFromBot(true);
removeTaskData.addIntegerOption((option) =>
    option
        .setName("content")
        .setDescription("index of the item to remove from your list")
        .setRequired(true)
);

const removeTask = new SubCommand(
    removeTaskData,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set(
            "content",
            message.content
                .slice(prefix.length + commandLength)
                .trim()
        );
        return args;
    },
    async function execute(message, args, fromInteraction, gconfig, isButton) {
        if (!args.get("content")) {
            action.reply(message, {
                content: "you need to supply an item to remove from the list",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        const whichList = whichListForUser[message.author.id] || "main";
        const list = ensureList(message.author.id, whichList);
        const listLength = readList(message.author.id, whichList).length;
        const taskIndex = parseInt(args.get("content"));
        if (isNaN(taskIndex) || taskIndex < 1 || taskIndex > listLength) {
            action.reply(message, {
                content: "invalid task index",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        const task = readList(message.author.id, whichList)[taskIndex - 1];
        await removeListItem(message.author.id, whichList, taskIndex - 1);
        refresh(message.author.id, gconfig);
        if (isButton) {
            message.deferUpdate();
            return;
        }
        action.reply(message, {
            content: `removed task #${taskIndex} from list "${whichList}": "${task.value}"`,
            ephemeral: gconfig.useEphemeralReplies,
        });
    }
);

const checkOffTaskData = new SubCommandData();
checkOffTaskData.setName("check");
checkOffTaskData.setDescription("checks off a task from your todo list");
checkOffTaskData.setPermissions([]);
checkOffTaskData.setPermissionsReadable("");
checkOffTaskData.setWhitelist([]);
checkOffTaskData.setCanRunFromBot(true);
checkOffTaskData.setAliases([
    "uncheck",
    "complete",
    "uncomplete",
    "toggle",
    "finish",
    "unfinish",
]);
checkOffTaskData.addStringOption((option) =>
    option
        .setName("content")
        .setDescription("index of the item to check off from your list")
        .setRequired(true)
);

const checkOffTask = new SubCommand(
    checkOffTaskData,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set(
            "content",
            message.content
                .slice(prefix.length + commandLength)
                .trim()
        );
        return args;
    },
    async function execute(message, args, fromInteraction, gconfig, isButton) {
        if (!args.get("content")) {
            action.reply(message, {
                content:
                    "you need to supply an item to check off from the list",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        const whichList = whichListForUser[message.author.id] || "main";
        const l = ensureList(message.author.id, whichList);
        const list = readList(message.author.id, whichList);
        const listLength = list.length;
        const taskIndex = parseInt(args.get("content"));
        if (isNaN(taskIndex) || taskIndex < 1 || taskIndex > listLength) {
            action.reply(message, {
                content: "invalid task index",
                ephemeral: gconfig.useEphemeralReplies,
            });
            return;
        }
        let repl = `checked off task #${taskIndex} from list "${whichList}"`;
        const task = list[taskIndex - 1];
        let setTaskCompleted = true;
        if (task.completed) {
            setTaskCompleted = false;
            repl = `unchecked task #${taskIndex} from list "${whichList}"`;
        }
        editList(
            message.author.id,
            whichList,
            taskIndex - 1,
            task.value,
            setTaskCompleted
        );
        refresh(message.author.id, gconfig);
        if (isButton) {
            message.deferUpdate();
            return;
        }
        action.reply(message, { content: repl, ephemeral: gconfig.useEphemeralReplies });
    }
);

const buttonFunctions = {
    add: async function (interaction, gconfig) {
        const modal = new ModalBuilder();
        modal.setTitle("Add Task");
        modal.setCustomId("add");
        const task = new TextInputBuilder()
            .setPlaceholder("enter the task you want to add")
            .setLabel("Task")
            .setStyle(TextInputStyle.Short)
            .setCustomId("task");
        const actionRow = new ActionRowBuilder().addComponents(task);
        modal.addComponents(actionRow);

        interaction.showModal(modal);
        const filter = (interaction) => interaction.customId === "add";
        interaction
            .awaitModalSubmit({ filter, time: 360_000 })
            .then(async (interaction) => {
                const input = interaction.fields.getTextInputValue("task");
                const args = new Collection();
                args.set("content", input);
                interaction.author = interaction.user;
                await addTask.execute(interaction, args, true, gconfig, true);
            })
            .catch(log.error);
    },
    remove: async function (interaction, gconfig) {
        const modal = new ModalBuilder();
        modal.setTitle("Remove Task");
        modal.setCustomId("remove");
        const task = new TextInputBuilder()
            .setPlaceholder("enter the index of the task you want to remove")
            .setLabel("Task")
            .setStyle(TextInputStyle.Short)
            .setCustomId("task");
        const actionRow = new ActionRowBuilder().addComponents(task);
        modal.addComponents(actionRow);

        interaction.showModal(modal);
        const filter = (interaction) => interaction.customId === "remove";
        interaction
            .awaitModalSubmit({ filter, time: 360_000 })
            .then(async (interaction) => {
                const input = interaction.fields.getTextInputValue("task");
                const args = new Collection();
                args.set("content", input);
                interaction.author = interaction.user;
                await removeTask.execute(
                    interaction,
                    args,
                    true,
                    gconfig,
                    true
                );
            })
            .catch(log.error);
    },
    check: async function (interaction, gconfig) {
        const modal = new ModalBuilder();
        modal.setTitle("Check Task");
        modal.setCustomId("check");
        const task = new TextInputBuilder()
            .setPlaceholder(
                "enter the index of the task you want to check off/on"
            )
            .setLabel("Task")
            .setStyle(TextInputStyle.Short)
            .setCustomId("task");
        const actionRow = new ActionRowBuilder().addComponents(task);
        modal.addComponents(actionRow);

        interaction.showModal(modal);
        const filter = (interaction) => interaction.customId === "check";
        interaction
            .awaitModalSubmit({ filter, time: 360_000 })
            .then(async (interaction) => {
                const input = interaction.fields.getTextInputValue("task");
                const args = new Collection();
                args.set("content", input);
                interaction.author = interaction.user;
                await checkOffTask.execute(
                    interaction,
                    args,
                    true,
                    gconfig,
                    true,
                    gconfig
                );
            })
            .catch(log.error);
    },
    switch: async function (interaction, gconfig) {
        const modal = new ModalBuilder();
        modal.setTitle("Switch Lists");
        modal.setCustomId("switch");
        const task = new TextInputBuilder()
            .setPlaceholder(
                "enter the name of the list you would like to switch to"
            )
            .setLabel("Task")
            .setStyle(TextInputStyle.Short)
            .setCustomId("task");
        const actionRow = new ActionRowBuilder().addComponents(task);
        modal.addComponents(actionRow);

        interaction.showModal(modal);
        const filter = (interaction) => interaction.customId === "switch";
        interaction
            .awaitModalSubmit({ filter, time: 360_000 })
            .then(async (interaction) => {
                const input = interaction.fields.getTextInputValue("task");
                const args = new Collection();
                args.set("content", input);
                interaction.author = interaction.user;
                await switchc.execute(interaction, args, true, gconfig, true, gconfig);
            })
            .catch(log.error);
    },
};

function onComponentCollect(interaction, gconfig) {
    if (!interaction.isButton()) return;
    const button = interaction.customId;
    if (button in buttonFunctions) {
        return buttonFunctions[button](interaction, gconfig);
    }
}

const data = new CommandData();
data.setName("todo");
data.setDescription("manages a todo list for yourself");
data.setPermissions([]);
data.setPermissionsReadable("");
data.setWhitelist([]);
data.setCanRunFromBot(false);
;
data.setAliases(["list"]);
data.addStringOption((option) =>
    option
        .setName("subcommand")
        .setDescription("the subcommand to use")
        .setRequired(false)
        .addChoices(
            { name: "add", value: "add" },
            { name: "remove", value: "remove" },
            { name: "check", value: "check" },
            { name: "switch", value: "switch" }
        )
);
data.addStringOption((option) =>
    option
        .setName("content")
        .setDescription(
            "the args to pass to the subcommand, commonly an index or an item on the list"
        )
        .setRequired(false)
);
const command = new Command(
    data,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set("_SUBCOMMAND", message.content.split(" ")[1]);
        if (args.get("args")) {
            args.set(
                "content",
                message.content.slice(
                    prefix.length +
                        commandLength +
                        message.content.split(" ")[1].length +
                        1
                )
            );
        }
        return args;
    },
    async function execute(message, args, fromInteraction, gconfig) {
        const sent = await action.reply(message, {
            embeds: [],
            components: [],
            ephemeral: gconfig.useEphemeralReplies,
            content: "loading embed..."
        });
        sent.createMessageComponentCollector({
            ComponentType: ComponentType.Button,
            time: 360_000,
            filter: (interaction) => interaction.user.id === message.author.id,
        })
            .on("collect", (interaction) => {
                onComponentCollect(interaction, gconfig);
            })
            .on("end", () => {
                if (latestEmbeds[message.author.id]) {
                    latestEmbeds[message.author.id].message = null;
                }
                action.editMessage(sent, {
                    content:
                        "to avoid memory leaks, this collector has been stopped. run the command again to get these buttons back. ",
                    components: [],
                });
            });
        if (fromInteraction) {
            message.author = message.user;
        }
        latestEmbeds[message.author.id] = {
            message: sent,
            executedMessage: message,
            fromInteraction: fromInteraction,
            menu: undefined,
        };

        refresh(message.author.id, gconfig);
    },
    [addTask, removeTask, checkOffTask, switchc, which] // subcommands
);

export default command;
