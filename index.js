require("dotenv").config();
const fs = require("fs");
const { Telegraf } = require("telegraf");
const bot = new Telegraf(process.env.TG_BOT);
const solanaWeb3 = require("@solana/web3.js");
const solanaSpl = require("@solana/spl-token");
const { default: axios } = require("axios");
const schedule = require("node-schedule");
// TO FETCH TOKEN INFO
const SOLANASCAN_BASE_URL = "https://public-api.solscan.io/";

//VALIDATION FUNCTIONS
//check if the input is in the defined format or not
const validateUserInput = (userInput) => {
  return userInput.split(":").length != 2;
};
const validateSolanaAddress = async (address) => {
  try {
    const key = new solanaWeb3.PublicKey(address);
    const isValidAddress = await solanaWeb3.PublicKey.isOnCurve(key.toString());
    return isValidAddress;
  } catch (error) {
    console.log(error);
    return false;
  }
};

//HELPER FUNCTIONS
//read data from  the file
const readData = () => {
  try {
    const fileData = fs.readFileSync("./data.json", "utf8");
    const JsonData = JSON.parse(fileData);
    return JsonData;
  } catch (error) {
    console.log(error);
  }
};
// store it in json file
const writeToFile = (key, data) => {
  try {
    let JsonData = readData();
    if (!JsonData[key]) {
      JsonData[key] = data;
    } else {
      console.log("Data already exists");
    }
    fs.writeFileSync("./data.json", JSON.stringify(JsonData));
  } catch (error) {
    console.log(error);
    throw error;
  }
};
// get  the token info of the user
const getTokenInfo = async (account) => {
  const connection = new solanaWeb3.Connection(process.env.RPC_URL);
  const accountKey = new solanaWeb3.PublicKey(account);
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    accountKey,
    { programId: solanaSpl.TOKEN_PROGRAM_ID }
  );
  let response = { ZeroBalance: [], NonZeroBalance: [] };
  let result = null;
  if (tokenAccounts && tokenAccounts.value) {
    const promisesArray = tokenAccounts.value.map(async (details) => {
      if (details.account.data) {
        return axios
          .get(
            `${SOLANASCAN_BASE_URL}/token/meta?tokenAddress=${details.account.data.parsed.info.mint}`
          )
          .then(async (apiResponse) => {
            return {
              Token: details.account.data.parsed.info.mint,
              Amount: details.account.data.parsed.info.tokenAmount.uiAmount,
              PubKey: details.pubkey.toString(),
              TokenDetail: apiResponse.data.name,
            };
          });
        // }
      }
    });
    result = await Promise.all(promisesArray);
  }
  result.forEach((data) => {
    if (data.Amount == 0) response.ZeroBalance.push(data);
    else response.NonZeroBalance.push(data);
  });
  return response;
};
// make it human readable
const parseText = (data) => {
  const zeroBalance = data.ZeroBalance;
  const nonZeroBalance = data.NonZeroBalance;
  let formattedText = `<----Here is a list of your token details----->\n`;
  formattedText = formattedText.concat(
    "\nList of token accounts with 0 balance:\n\n"
  );
  zeroBalance.forEach((token) => {
    formattedText = formattedText.concat(`Token: ${token.TokenDetail}\n\n`);
  });
  formattedText = formattedText.concat(
    "\n-----------------------------------------"
  );
  formattedText = formattedText.concat(
    "\n\nList of token accounts with Non Zero balance:\n\n"
  );
  nonZeroBalance.forEach((token) => {
    formattedText = formattedText.concat(
      `Balance of ${
        token.TokenDetail.length == 0 ? "Unknown" : token.TokenDetail
      } is ${token.Amount}\n\n`
    );
  });

  return formattedText;
};

// BOT COMMANDS
// method for invoking when someone starts
bot.command("start", (ctx) => {
  console.log(`${ctx.message.chat.username} wants a report`);
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Hey there Solana fam \\!\\! We provide you with time\\-to\\-time information about your Token Account with 0 balance for a prlonged time so that you can take action on them to get your ideal laying SOL tokens\\.\n In the next input enter the details in the following format\\: *** \\<WALLET ADDRESS\\>\\:\\<TIME INTERVAL IN DAYS\\> ***\\.\n Ex\\: *DCDSTN6LBD8NXbzapaLbUSKgtv8puVU11LqQ7Eun3fTQ:1* \\. It essentially says that everyday send me the status of empty token addresses of DCDSTN6LBD8NXbzapaLbUSKgtv8puVU11LqQ7Eun3fTQ",
    { parse_mode: "MarkdownV2" }
  );
  // handle user input
  bot.on("text", async (ctx) => {
    // Explicit usage
    if (readData()[ctx.message.chat.id]) {
      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Sorry!You are already registered`
      );
    } else {
      let isValid = true;
      try {
        const userinput = ctx.message.text;
        if (validateUserInput(userinput)) {
          isValid = false;
          await ctx.telegram.sendMessage(
            ctx.message.chat.id,
            `Sorry! The format of input is incorrect`
          );
        }
        if (isValid && userinput.split(":")[0]) {
          try {
            const isValidAddress = await validateSolanaAddress(
              userinput.split(":")[0]
            );
            if (!isValidAddress) {
              isValid = false;
              await ctx.telegram.sendMessage(
                ctx.message.chat.id,
                `Sorry! The solana address format is incorrect`
              );
            }
          } catch (error) {
            isValid = false;
            await ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `Sorry! The solana address format is incorrect`
            );
          }
        }
        if (isValid && userinput.split(":")[1]) {
          const regex = /^[0-9]+$/;
          if (!userinput.split(":")[1].match(regex)) {
            isValid = false;
            await ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `Sorry! The days should be a number`
            );
          }
        }
        if (isValid) {
          const data = readData();
          if (data[ctx.message.chat.id]) {
            await ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `You are already registered with * ${
                data[ctx.message.chat.id].address
              }*`,
              { parse_mode: "MarkdownV2" }
            );
          } else {
            const job = schedule.scheduleJob(`* * */${parseInt(userinput.split(":")[1])} * *`, async function () {
              const details = await getTokenInfo(userinput.split(":")[0]);
              const readableDetail = parseText(details);
              let latestData = readData()
              await ctx.telegram.sendMessage(
                ctx.message.chat.id,
                `*Here comes your Account report of ${latestData[ctx.message.chat.id].address} after ${
                    latestData[ctx.message.chat.id].time
                } day${latestData[ctx.message.chat.id].time == 1? '':'s'} \\!\\!*`,
                { parse_mode: "MarkdownV2" }
              );
              await ctx.telegram.sendMessage(
                ctx.message.chat.id,
                readableDetail
              );
            });
            console.log(job);
            writeToFile(ctx.message.chat.id, {
              address: userinput.split(":")[0],
              time: userinput.split(":")[1],
              chat_id: ctx.message.chat.id,
              tg_id: ctx.message.chat.username,
            });
            const details = await getTokenInfo(userinput.split(":")[0]);
            const readableDetail = parseText(details);
            await ctx.telegram.sendMessage(
              ctx.message.chat.id,
              `Awesome!! You are all set. Here are the brief overview of your Account Details!!`
            );
            await ctx.telegram.sendMessage(ctx.message.chat.id, readableDetail);
            console.log(`report sent to ${ctx.message.chat.username}`);
          }
        }
        // TODO: set cron task here
      } catch (error) {
        console.log(error);
      }
    }
  });
});
// command to fetch user details without having them to enter wallet address again
bot.command("report", async (ctx) => {
  const data = readData();
  if (data[ctx.message.chat.id]) {
    const address = data[ctx.message.chat.id].address;
    const details = await getTokenInfo(address);
    const readableDetail = parseText(details);
    await ctx.telegram.sendMessage(
      ctx.message.chat.id,
      `Here goes your account report for *${address}*`,
      { parse_mode: "MarkdownV2" }
    );
    await ctx.telegram.sendMessage(ctx.message.chat.id, readableDetail);
  } else {
    console.log("Record doesnt exists");
    await ctx.telegram.sendMessage("Sorry Mate, you need to register first");
  }
});

// launch bot
bot.launch();

// // Enable graceful stop
process.once("SIGINT", () => {
  bot.stop("SIGINT");
  schedule.gracefulShutdown().then(() => process.exit(0));
});
process.once("SIGTERM", () => bot.stop("SIGTERM"));
