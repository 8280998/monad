import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { ethers } from 'ethers';
import './App.css'; // Import the new CSS for styling

// Set app element for modal accessibility
Modal.setAppElement('#root');

const CONTRACT_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "guess", "type": "string"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "placeBet",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "resolveBet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "betId", "type": "uint256"}],
    "name": "getBet",
    "outputs": [
      {
        "components": [
          {"internalType": "address", "name": "user", "type": "address"},
          {"internalType": "string", "name": "guess", "type": "string"},
          {"internalType": "uint256", "name": "amount", "type": "uint256"},
          {"internalType": "bytes1", "name": "targetByte", "type": "bytes1"},
          {"internalType": "bool", "name": "won", "type": "bool"},
          {"internalType": "uint256", "name": "reward", "type": "uint256"},
          {"internalType": "uint256", "name": "blockNumber", "type": "uint256"},
          {"internalType": "bool", "name": "resolved", "type": "bool"}
        ],
        "internalType": "struct GuessCounterGame.Bet",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "betCounter",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "uint256", "name": "betId", "type": "uint256"},
      {"indexed": true, "internalType": "address", "name": "user", "type": "address"},
      {"indexed": false, "internalType": "string", "name": "guess", "type": "string"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "blockNumber", "type": "uint256"}
    ],
    "name": "BetPlaced",
    "type": "event"
  }
];

const ERC20_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "_spender", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {"name": "_owner", "type": "address"},
      {"name": "_spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "type": "function"
  }
];

// Hardcoded values - removed from UI
const RPC_URL = "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;
const CONTRACT_ADDRESS = "0xd081Ae7bA1Ee5e872690F2cC26dfa588531eA628";
const TOKEN_ADDRESS = "0xF7C90D79a1c2EA9c9028704E1Bd1FCC3619b5a37";
const EXPLORER_URL = "https://testnet.monadexplorer.com/tx/";
const COOLDOWN = 1; // seconds
const BLOCK_WAIT_TIME = 2; // seconds
const MONAD_CHAIN_ID_HEX = "0x2797"; // 10143 in hex

const App = () => {
  const [betAmount, setBetAmount] = useState(100.0);
  const [numBets, setNumBets] = useState(100);
  const [mode, setMode] = useState("1"); // 1: manual, 2: random
  const [guess, setGuess] = useState("0");
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(0);
  const [logs, setLogs] = useState([]);
  const [isBetting, setIsBetting] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [modalIsOpen, setModalIsOpen] = useState(false);

  useEffect(() => {
    if (account && provider) {
      updateBalance();
    }
  }, [account, provider]);

  const addLog = (message, txHash = null) => {
    setLogs(prev => [...prev, { message, txHash }]);
  };

  // Detect and prioritize wallets
  const detectWallet = () => {
    if (window.okxwallet) {
      window.ethereum = window.okxwallet.ethereum;
      return 'OKX';
    }
    if (typeof window.ethereum !== 'undefined') {
      return 'MetaMask/Coinbase';
    }
    if (window.coinbaseWalletExtension) {
      window.ethereum = window.coinbaseWalletExtension;
      return 'Coinbase';
    }
    return null;
  };

  const connectWallet = async () => {
    const wallet = detectWallet();
    if (!window.ethereum) {
      addLog("No wallet detected. Install MetaMask, OKX, or Coinbase Wallet.");
      return;
    }

    try {
      // Switch to Monad Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_CHAIN_ID_HEX }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) { // Chain not added
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MONAD_CHAIN_ID_HEX,
              chainName: 'Monad Testnet',
              rpcUrls: [RPC_URL],
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              blockExplorerUrls: ['https://testnet.monadexplorer.com/'],
            }],
          });
        } else {
          throw switchError;
        }
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      const newSigner = await newProvider.getSigner();
      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
      addLog(`Connected to ${wallet || 'Wallet'}: ${accounts[0]}`);
      const network = await newProvider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        addLog(`Warning: Connected to chain ${network.chainId}, expected ${CHAIN_ID}`);
      }
    } catch (error) {
      addLog(`Wallet connection failed: ${error.message}`);
    }
  };

  const updateBalance = async () => {
    try {
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider);
      const bal = await tokenContract.balanceOf(account);
      setBalance(ethers.formatEther(bal));
    } catch (error) {
      addLog(`Failed to fetch balance: ${error.message}`);
    }
  };

  const approveToken = async (contractAddr, tokenContract) => {
    try {
      const allowance = await tokenContract.allowance(account, contractAddr);
      const required = ethers.parseEther(betAmount.toString()) * BigInt(numBets);
      if (allowance < required) {
        const tx = await tokenContract.approve(contractAddr, ethers.MaxUint256);
        addLog(`Approving tokens... Tx: ${tx.hash}`, tx.hash);
        await tx.wait();
        addLog(`Approval confirmed.`);
      }
    } catch (error) {
      addLog(`Approval failed: ${error.message}`);
      throw error;
    }
  };

  const placeBet = async (contract, currentGuess) => {
    try {
      const amountWei = ethers.parseEther(betAmount.toString());
      const tx = await contract.placeBet(currentGuess, amountWei);
      addLog(`Placing bet with guess ${currentGuess}... Tx: ${tx.hash}`, tx.hash);
      const receipt = await tx.wait();
      const iface = new ethers.Interface(CONTRACT_ABI);
      let betId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'BetPlaced') {
            betId = parsed.args.betId;
            break;
          }
        } catch {}
      }
      if (!betId) throw new Error('Failed to extract betId');
      addLog(`Bet placed. Bet ID: ${betId.toString()}, Block: ${receipt.blockNumber}`);
      return { receipt, txHash: tx.hash, betId: betId.toString() };
    } catch (error) {
      addLog(`Place bet failed: ${error.message}`);
      throw error;
    }
  };

  const resolveBet = async (contract, betId) => {
    try {
      const tx = await contract.resolveBet(BigInt(betId));
      addLog(`Resolving bet ${betId}... Tx: ${tx.hash}`, tx.hash);
      const receipt = await tx.wait();
      const bet = await contract.getBet(BigInt(betId));
      const won = bet[4];
      const reward = ethers.formatEther(bet[5]);
      const blockNumber = bet[6].toString();
      const block = await provider.getBlock(Number(blockNumber));
      const targetByte = String.fromCharCode(bet[3]); // Assuming bytes1 to char
      addLog(`Bet ${betId} resolved. Block Hash: ${block.hash}, Target Byte: ${targetByte}`);
      if (won) {
        addLog(`Won! Reward: ${reward} tokens. Tx: ${tx.hash}`, tx.hash);
        addLog(`////////////////////////////////////////////////////////////////////`);
        addLog(`//                                                                //`);
        addLog(`//    恭喜！竞猜ID ${betId} 获胜！奖励${reward} 代币已自动发送到你的地址    //`);
        addLog(`//                                                                //`);
        addLog(`////////////////////////////////////////////////////////////////////`);
      } else {
        addLog(`Lost bet ${betId}.`);
      }
      return { bet, txHash: tx.hash };
    } catch (error) {
      addLog(`Resolve failed: ${error.message}`);
      throw error;
    }
  };

  const startBetting = async () => {
    if (!signer || !account) {
      addLog("Connect wallet first.");
      return;
    }
    if (mode === '1' && !'0123456789abcdef'.includes(guess)) {
      addLog("Invalid guess for manual mode.");
      return;
    }
    setIsBetting(true);
    setStopRequested(false);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
      await approveToken(CONTRACT_ADDRESS, tokenContract);

      for (let i = 0; i < numBets; i++) {
        if (stopRequested) break;
        const currentGuess = mode === '1' ? guess : '0123456789abcdef'.charAt(Math.floor(Math.random() * 16));
        addLog(`Attempting bet ${i+1}/${numBets} with guess ${currentGuess}`);
        const { betId } = await placeBet(contract, currentGuess);
        await new Promise(resolve => setTimeout(resolve, BLOCK_WAIT_TIME * 1000));
        await resolveBet(contract, betId);
        await new Promise(resolve => setTimeout(resolve, COOLDOWN * 1000));
        updateBalance();
      }
    } catch (error) {
      addLog(`Betting process error: ${error.message}`);
    } finally {
      setIsBetting(false);
    }
  };

  const stopBetting = () => {
    setStopRequested(true);
    addLog("Stopping betting...");
  };

  const shortenHash = (hash) => hash ? `${hash.slice(0, 6)}...${hash.slice(-4)}` : '';

  const possibleGuesses = '0123456789abcdef'.split('');

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Monad Betting Game</h1>
        <p className="subtitle">Bet on the blockchain – Win big or go home!</p>
      </header>
      <button className="connect-btn" onClick={connectWallet}>
        Connect Wallet (MetaMask/OKX/Coinbase)
      </button>
      {account && (
        <div className="account-info">
          <p>Account: {shortenHash(account)}</p>
          <p>Balance: {balance} MON</p>
        </div>
      )}
      <button className="instructions-btn" onClick={() => setModalIsOpen(true)}>
        Instructions
      </button>
      <Modal
        isOpen={modalIsOpen}
        onRequestClose={() => setModalIsOpen(false)}
        className="modal-content"
        overlayClassName="modal-overlay"
      >
        <h2>Game Instructions</h2>
        <p>针对竞猜所在区块哈希尾号内容的字符值，猜0-9 或 a-f</p>
        <p>竞猜正确赢得投注额 *12 倍奖励，竞猜错误失去投注额币</p>
        <p>交易哈希值不是区块哈希值，区块哈希可包含多个交易哈希</p>
        <p>为保证公平公开透明，仅针对竞猜时产生的区块哈希尾号值</p>
        <button className="close-btn" onClick={() => setModalIsOpen(false)}>
          Close
        </button>
      </Modal>

      <div className="betting-section">
        <div className="mode-selector">
          <label>Bet Mode:</label>
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="1">Manual</option>
            <option value="2">Random</option>
          </select>
        </div>
        {mode === '1' && (
          <div className="guess-selector">
            <label>Guess:</label>
            <div className="guess-buttons">
              {possibleGuesses.map(g => (
                <button
                  key={g}
                  onClick={() => setGuess(g)}
                  className={`guess-btn ${guess === g ? 'active' : ''}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="input-group">
          <label>Bet Amount (MON):</label>
          <input
            type="number"
            value={betAmount}
            onChange={e => setBetAmount(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div className="input-group">
          <label>Number of Bets:</label>
          <input
            type="number"
            value={numBets}
            onChange={e => setNumBets(Number(e.target.value))}
            className="input-field"
          />
        </div>
        <div className="bet-buttons">
          <button onClick={startBetting} disabled={isBetting} className="start-btn">
            Start Betting
          </button>
          <button onClick={stopBetting} disabled={!isBetting} className="stop-btn">
            Stop Betting
          </button>
        </div>
      </div>

      <div className="logs-section">
        <h2>Transaction Logs</h2>
        <div className="logs-container">
          {logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span className="log-message">{log.message}</span>
              {log.txHash && (
                <a
                  href={`${EXPLORER_URL}${log.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-link"
                >
                  {shortenHash(log.txHash)}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
