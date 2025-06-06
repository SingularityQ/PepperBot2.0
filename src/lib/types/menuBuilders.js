import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import * as log from "../log.js";

export class AdvancedPagedMenuBuilder {
    constructor(startPage) {
        this.pages = [];
        let pages = this.pages;
        let currentPage = startPage || 0;
        let actionRow = new ActionRowBuilder();
        let previousButton = new ButtonBuilder()
            .setCustomId("previous")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Primary);
        let nextButton = new ButtonBuilder()
            .setCustomId("next")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary);
        actionRow.setComponents(previousButton, nextButton);
        return {
            actionRow: actionRow,
            currentPage: currentPage,
            pages: pages,
            full: this,
        };
    }

    addPage(page) {
        this.pages.push(page);
    }
    setPages(pages) {
        this.pages = pages;
    }
    begin(sentMessage, duration, { actionRow, currentPage, pages }) {
        pages = this.pages;
        if (!sentMessage) return;
        let embed = pages[currentPage];

        const collector = sentMessage.createMessageComponentCollector({
            time: duration,
        });
        collector.on("collect", async (interaction) => {
            if (interaction.customId === "previous") {
                if (currentPage > 0) {
                    currentPage--;
                } else {
                    currentPage = pages.length - 1;
                }
                embed = pages[currentPage];
                interaction.update({ embeds: [embed] });
            } else if (interaction.customId === "next") {
                if (currentPage < pages.length - 1) {
                    currentPage++;
                } else {
                    currentPage = 0;
                }
                embed = pages[currentPage];
                interaction.update({ embeds: [embed] });
            }
            this.collector = collector;
        });
        collector.on("end", async (collected, reason) => {
            if (reason === "time") {
                sentMessage.edit({
                    content:
                        "to avoid memory leaks, this collector has been stopped. run the command again if you wish to use it again.",
                    embeds: [embed],
                    components: [],
                });
            }
        });
        this.collector = collector;
    }
    stop() {
        if (this.collector) {
            try {
                this.collector.stop();
            } catch {
                log.warn("Failed to stop collector");
            }
        }
    }
}
