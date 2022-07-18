import { ethers, Contract } from "ethers";
import axios from "axios";

import dotenv from "dotenv";

dotenv.config();

const PATH_FINDER_API_URL = "https://api.pathfinder.routerprotocol.com/api";

const fetchPathfinderData = async (params) => {
    const endpoint = "quote";
    const pathUrl = `${PATH_FINDER_API_URL}/${endpoint}`;
    console.log(pathUrl);
    try {
        const res = await axios.get(pathUrl, { params });
        return res.data;
    } catch (e) {
        console.error(`Fetching data from pathfinder: ${e}`);
    }
};

// ERC20 Contract ABI for "Approve" and "Allowance" functions
const erc20_abi = [
    {
        name: "approve",
        inputs: [
            {
                internalType: "address",
                name: "spender",
                type: "address",
            },
            {
                internalType: "uint256",
                name: "amount",
                type: "uint256",
            },
        ],
        outputs: [
            {
                internalType: "bool",
                name: "",
                type: "bool",
            },
        ],
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        name: "allowance",
        inputs: [
            {
                internalType: "address",
                name: "owner",
                type: "address",
            },
            {
                internalType: "address",
                name: "spender",
                type: "address",
            },
        ],
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256",
            },
        ],
        stateMutability: "view",
        type: "function",
    },
];

// Fetch the current allowance and update if needed
const checkAndSetAllowance = async (
    wallet,
    tokenAddress,
    approvalAddress,
    amount
) => {
    // Transactions with the native token don't need approval
    if (tokenAddress === ethers.constants.AddressZero) {
        return;
    }

    const erc20 = new Contract(tokenAddress, erc20_abi, wallet);
    const allowance = await erc20.allowance(
        await wallet.getAddress(),
        approvalAddress
    );
    if (allowance.lt(amount)) {
        const approveTx = await erc20.approve(approvalAddress, amount, {
            gasPrice: await wallet.provider.getGasPrice(),
        });
        try {
            await approveTx.wait();
            console.log(`Transaction mined succesfully: ${approveTx.hash}`);
        } catch (error) {
            console.log(`Transaction failed with error: ${error}`);
        }
    }
};

const main = async () => {
    const reserveTokenAddress = "0x6e14f48576265272B6CAA3A7cC500a26050Be64E";

    const args = {
        fromTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI on ETH Mainnet
        toTokenAddress: "0x385Eeac5cB85A38A9a07A70c73e0a3271CfB54A7", // USDC on Fantom
        amount: "1000000000000000000", // 1 DAI on Eth Mainnet with 18 decimals
        fromTokenChainId: 1, // ETH Mainnet
        toTokenChainId: 137, // Polygon
        userAddress: process.env.WALLET_ADDRESS,
        feeTokenAddress: "0x16ECCfDbb4eE1A85A33f3A9B21175Cd7Ae753dB4", // ROUTE on Polygon
        slippageTolerance: 2,
    };
    const pathfinder_response = await fetchPathfinderData(args);

    // setting up wallet
    const provider = new ethers.providers.JsonRpcProvider(
        "https://polygon-rpc.com",
        137
    );
    const PRIVATE_KEY = process.env.PRIVATE_KEY
        ? process.env.PRIVATE_KEY
        : "0x";
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    checkAndSetAllowance(
        wallet,
        args.fromTokenAddress,
        reserveTokenAddress,
        args.amount
    );

    // setting the gas price and limit
    if (!pathfinder_response.txn.execution.gasPrice) {
        pathfinder_response.txn.execution.gasPrice =
            await wallet.provider.getGasPrice();
    }

    if (pathfinder_response.txn.execution.value) {
        pathfinder_response.txn.execution.value = ethers.utils.hexlify(
            ethers.BigNumber.from(pathfinder_response.txn.execution.value)
        );
    }

    if (!pathfinder_response.txn.execution.gasLimit) {
        pathfinder_response.txn.execution.gasLimit = ethers.utils.hexlify(
            ethers.BigNumber.from(1000000)
        );
    }

    // sending the transaction using the data given by the pathfinder
    const tx = await wallet.sendTransaction(pathfinder_response.txn.execution);
    try {
        await tx.wait();
        console.log(`Transaction mined successfully: ${tx.hash}`);
    } catch (error) {
        console.log(`Transaction failed with error: ${error}`);
    }
};

main();
