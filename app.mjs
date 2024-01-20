import {Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import BigNumber from 'bignumber.js';
import { createTransferCheckedInstruction, getAccount, getAssociatedTokenAddress, getMint } from '@solana/spl-token';
import { TEN,validateTransfer,ValidateTransferError,findReference,FindReferenceError} from '@solana/pay';
import express from 'express';
import axios from 'axios';
import https from 'https';

const app = express();

app.use(express.json());

// API endpoints will be defined here

const port = 3000; // choose any port you prefer

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// GET endpoint
app.get('/api/merchant', (req, res) => {
  
    const label = ' CAYC SWAP ';
    const icon = 'https://github.com/UnrealKingdoms/public/blob/996bf1ec127402a2d28d40c28a832259bdcfcb01/icon.png?raw=true';
  
    res.status(200).json({
      label,
      icon,
    });
});

const MERCHANT_WALLET = new PublicKey("EmPnKvMjNLFyPTx5kau2U41JXqD9qUXKY3Qig8hvz5Ek");
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const tokenAddress=new PublicKey("9jDpKzpHz6fatL8CiJjRhAGsLJmLMzXvynwxY5y7ykKF");
const tokenApi='SSTpPeZX3YagFrWTk1qvQ308q7cOUsKkiuAx4o5qTc3frZ9WCmqd0KH0wDVMzt2JHWbLfvoYCQkJX8A81AIttExli8DvYZa88I7a5eZ3SDaFUvtTxc7UzW5qpat1GLgiL3YpbS1ZCAL9Oh';

let referencePublic;
let signatureInfo;
let sendAmount;
let userSender;



app.post('/api/merchant',async(request,response)=>{

 try {
     // Account provided in the transaction request body by the wallet.
     const accountField = request.body?.account;
     if (!accountField) throw new Error('missing account');
  
     //decodes the url
     const fullUrl = request.protocol + '://' + request.get('host') + request.originalUrl;
     const decodedUrl = decodeURIComponent(fullUrl);
     const url = new URL(decodedUrl);
     const searchParams = new URLSearchParams(url.search);
    //  connection.requestAirdrop(sender,10000000000);  //for test purpose only
  
     //finds the amount, if not found throw error
     const amount = searchParams.get('amount');
     if (!amount) throw new Error('missing amount');

     userSender=searchParams.get('user_email');
     sendAmount=searchParams.get('amount');
     
     const sender = new PublicKey(accountField);
  
   // create  transfer instruction
      const tokenTransferIx = await createTokenTransferIx(sender, connection,amount);
  
      // create the transaction
      const transaction = new Transaction();
      transaction.add(tokenTransferIx);
      const bh=await connection.getLatestBlockhash();
      transaction.recentBlockhash=bh.blockhash;
      transaction.feePayer=sender;
  
        // Serialize and return the unsigned transaction.
        const serializedTransaction = transaction.serialize({
          verifySignatures: false,
          requireAllSignatures: false,
        });
  
        const base64Transaction = serializedTransaction.toString('base64');
  
        const message = 'Your swaping tokens for your in-game points';
  
        response.status(200).send({ transaction: base64Transaction, message });

         // Wait for the transaction to be confirmed
      const confirmation = await connection.confirmTransaction(base64Transaction, 'confirmed');
      if (!confirmation.value.err) {
        console.log('Transaction was successful');
      } else {
        console.error('Transaction failed:', confirmation.value.err);
      }
      
      // Check the transaction status
      const signatureStatuses = await connection.getSignatureStatuses([base64Transaction]);
      if (signatureStatuses && signatureStatuses.value[0] && signatureStatuses.value[0].err) {
        console.error('Transaction error:', signatureStatuses.value[0].err);
      }
  
 } catch (error) {
  // Log the error details for debugging
  console.error('An error occurred during the API request:', error.message);
  console.error('Error stack trace:', error.stack);
 }
});


async function createTokenTransferIx(sender,connection,amount){

    // Get the sender's ATA and check that the account exists and can send tokens if not found create one
   let senderATA = await getAssociatedTokenAddress(tokenAddress, sender);
    if (!senderATA) { 
       senderATA = await createAssociatedTokenAccount(
        connection, // connection
        sender, // fee payer
        tokenAddress, // mint
        sender // owner,
      );
    } 
    const senderAccount = await getAccount(connection, senderATA);
    if (!senderAccount.isInitialized) throw new Error('sender not initialized');
    if (senderAccount.isFrozen) throw new Error('sender frozen');

    // Get the merchant's ATA and check that the account exists and can receive tokens
    const merchantATA = await getAssociatedTokenAddress(tokenAddress, MERCHANT_WALLET);
    const merchantAccount = await getAccount(connection, merchantATA);
    if (!merchantAccount.isInitialized) throw new Error('merchant not initialized');
    if (merchantAccount.isFrozen) throw new Error('merchant frozen');

    // Check that the token provided is an initialized mint
    const mint = await getMint(connection, tokenAddress);
    if (!mint.isInitialized) throw new Error('mint not initialized');

    // You should always calculate the order total on the server to prevent
    // people from directly manipulating the amount on the client
    amount = new BigNumber(amount).times(new BigNumber(TEN).pow(mint.decimals)).integerValue(BigNumber.ROUND_FLOOR);


    // Check that the sender has enough tokens
    const tokens = BigInt(String(amount));
    if (tokens > senderAccount.amount) throw new Error('insufficient funds');

    // Create an instruction to transfer SPL tokens, asserting the mint and decimals match
    const splTransferIx = createTransferCheckedInstruction(
        senderATA,
        tokenAddress,
        merchantATA,
        sender,
        tokens,
        mint.decimals
    );

    // Create a reference that is unique to each checkout session
    // const references = [new Keypair().publicKey];
      referencePublic = new Keypair().publicKey;
     const references = [referencePublic];


    // add references to the instruction
    for (const pubkey of references) {
        splTransferIx.keys.push({ pubkey, isWritable: false, isSigner: false });
    }

    return splTransferIx;
}


app.get('/api/confirm-transaction',async(req,res)=>{

  const { transaction_id,amount,token } = req.query;

  let confirmed=false;

  if (token !== tokenApi ) {
    res.status(500).json({
      'status' : 'Invalid token',
     });
  }

  try{
   // Get the transaction details from the mainnet
   const transaction = await connection.getTransaction(transaction_id);

    // Access the transaction signature from the transaction object
    const transactionSignature = transaction?.transaction?.signatures[0];

    const transactionStatus= await connection.getSignatureStatus(transactionSignature, {
          searchTransactionHistory: true,
        });
    console.log(transactionStatus);
    const confirmationStatus = transactionStatus.value.confirmationStatus;

    if (confirmationStatus == 'finalized') {
      //validate the transfer
      let convAmount=new BigNumber(amount);
      try {
        // Wait for the validateTransfer function to complete using await
        await new Promise((resolve, reject) => {
          setTimeout(async () => {
            try {
              await validateTransfer(connection, transactionSignature, {
                recipient: MERCHANT_WALLET,
                amount: convAmount,
                splToken: tokenAddress,
              });

              console.log('Transaction validated');
              confirmed=true;
              console.log("another status", confirmed);
              resolve(); // Resolve the promise after successful validation
            } catch (error) {
              // If the RPC node doesn't have the transaction yet, try again
              if (
                error instanceof ValidateTransferError &&
                (error.message === 'not found' || error.message === 'missing meta')
              ) {
                console.error('Error:', error);
                reject(error); // Reject the promise if validation error
              }

              console.error('Error:', error);
              reject(error); // Reject the promise if an error occurred during validation
            }
          }, 50000);
        });
      } catch (error) {
        // Handle the rejected promise (validation error or timeout error)
        console.error('Error:', error);
      }
    
    }

 } catch (err) {
   console.error('Error:', err);
 }
   console.log("status",confirmed);
  res.status(200).json({
    'status' : confirmed ? 200: 500 ,
   });
});
