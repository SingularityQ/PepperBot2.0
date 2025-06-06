import * as action from "../lib/discord_action.js";
import { Command, CommandData } from "../lib/types/commands.js";
import { Collection } from "discord.js";
import fs from "fs";
import * as globals from "../lib/globals.js";

const config = globals.config;

const data = new CommandData();
data.setName("setversion");
data.setDescription("change bot version");
data.setPermissions([]);
data.setAliases(["version", "setv", "vset"]);
data.setPermissionsReadable("");
data.setWhitelist(["440163494529073152"]);
data.setCanRunFromBot(true);
;
data.addStringOption((option) =>
    option
        .setName("version")
        .setDescription("what to set version to")
        .setRequired(true)
);
const command = new Command(
    data,
    async function getArguments(message, gconfig) {
        const commandLength = message.content.split(" ")[0].length - 1;
        const args = new Collection();
        const prefix = gconfig.prefix || config.generic.prefix
        args.set(
            "version",
            message.content
                .slice(prefix.length + commandLength)
                .trim()
        );
        return args;
    },
    async function execute(message, args) {
        if (args.get("version")) {
            let persistent_data = JSON.parse(
                fs.readFileSync("resources/data/persistent_data.json", "utf-8")
            );
            persistent_data.version = args.get("version");
            await fs.writeFileSync(
                "resources/data/persistent_data.json",
                JSON.stringify(persistent_data, null, 2)
            );
            action.reply(
                message,
                `wrote version as \`${args.get("version")}\``
            );
        } else {
            action.reply(message, "provide a version you baffoon!");
        }
    }
);

export default command;
