require("dotenv").config();
const fs = require("fs");
const { Telegraf } = require("telegraf");
const bot = new Telegraf(process.env.TG_BOT);
const solanaWeb3 = require("@solana/web3.js");
const solanaSpl = require("@solana/spl-token");

// TO FETCH TOKEN INFO
const SOLANASCAN_BASE_URL = "public-api.solscan.io/";
// store it in json file
const writeToFile = (data) => {
  try {
    const fileData = fs.readFileSync("./data.json", "utf8");
    const JsonData = JSON.parse(fileData);
    JsonData.push(data);
    fs.writeFileSync("./data.json", JSON.stringify(JsonData));
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const getTokenInfo = async (account) => {
  const connection = new solanaWeb3.Connection(process.env.RPC_URL);
  const accountKey = new solanaWeb3.PublicKey(account);
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    accountKey,
    { programId: solanaSpl.TOKEN_PROGRAM_ID }
  );

  let response = { ZeroBalance: [], NonZeroBalance: [] };
  if (tokenAccounts && tokenAccounts.value) {
    tokenAccounts.value.forEach((details) => {
      console.log(details);
      console.log(details.account.data.parsed.info);
      if (details.account.data) {
        if (
          details.account.data.parsed.info.tokenAmount.uiAmount == 0 &&
          details.account.data.parsed.info.state == "initialized"
        ) {
          response.ZeroBalance.push({
            Token: details.account.data.parsed.info.mint,
            PubKey: details.pubkey.toString(),
          });
        } else {
          response.NonZeroBalance.push({
            Token: details.account.data.parsed.info.mint,
            Amount: details.account.data.parsed.info.tokenAmount.uiAmount,
            PubKey: details.pubkey.toString(),
          });
        }
      }
    });
  }
  console.log(response);
  return response;
};

const parseText = (data) => {
  const zeroBalance = data.ZeroBalance;
  const nonZeroBalance = data.NonZeroBalance;
  let formattedText = `----Here is a list of your token details-----\n`;
  formattedText = formattedText.concat(
    "\n\n\nList of token accounts with 0 balance:\n"
  );
  zeroBalance.forEach((token) => {
    formattedText = formattedText.concat(`Token: ${token.Token} \n\n`);
  });
  formattedText = formattedText.concat(
    "\n\n\nList of token accounts with Non Zero balance:\n\n"
  );
  nonZeroBalance.forEach((token) => {
    formattedText = formattedText.concat(
      `Token:${token.Token} has a balance of ${token.Amount}\n\n`
    );
  });

  return formattedText;
};
// method for invoking when someone starts
bot.command("start", (ctx) => {
  bot.telegram.sendMessage(
    ctx.chat.id,
    "Hey there Solana fam!! We provide you with time-to-time information about your Token Account with 0 balance for a prlonged time so that you can take action on them to get your ideal laying SOL tokens. In the next input enter the details in the following format: *** <WALLET ADDRESS>:<TIME INTERVAL IN DAYS> ***. Ex: *DCDSTN6LBD8NXbzapaLbUSKgtv8puVU11LqQ7Eun3fTQ:1* . It essentially says that everyday send me the status of empty token addresses of DCDSTN6LBD8NXbzapaLbUSKgtv8puVU11LqQ7Eun3fTQ",
    {}
  );
});

bot.on("text", async (ctx) => {
  // Explicit usage
  let isValid = true;
  try {
    console.log(ctx.message.chat);
    const userinput = ctx.message.text;
    if (userinput.split(":").length != 2) {
      isValid = false;
      await ctx.telegram.sendMessage(
        ctx.message.chat.id,
        `Sorry! The format of input is incorrect`
      );
    }
    if (isValid && userinput.split(":")[0]) {
      try {
        const key = new solanaWeb3.PublicKey(userinput.split(":")[0]);
        const isValidAddress = await solanaWeb3.PublicKey.isOnCurve(
          key.toString()
        );
        console.log(isValidAddress);
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
      writeToFile({
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
    }
  } catch (error) {
    console.log(error);
  }
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

// TEST WRITING AND READING DATA FROM A JSON FILE
// const data = fs.readFileSync("./data.json", 'utf8')
// const JSONDATA = (JSON.parse (data))
// JSONDATA.push({"hi":3})
// fs.writeFileSync("./data.json", JSON.stringify(JSONDATA))
