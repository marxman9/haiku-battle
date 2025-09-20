import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

// Heuristic-based syllable counting function. Not perfect, but good for real-time feedback.
const countSyllables = (text) => {
  text = text.toLowerCase().trim();
  if (!text) return 0;
  
  const words = text.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  let totalSyllables = 0;

  for (const word of words) {
    if (word.length === 0) continue;
    // Basic vowel counting
    let syllableCount = word.match(/[aeiouy]+/g)?.length || 0;

    // Subtract one for silent 'e' at the end, but not for words like 'the' or if it's 'le'
    if (word.endsWith('e') && !word.endsWith('le') && syllableCount > 1) {
        syllableCount--;
    }

    // Add 1 syllable for words with 0 vowels (e.g., "rhythm")
    if (syllableCount === 0) {
        syllableCount = 1;
    }
    
    totalSyllables += syllableCount;
  }
  return totalSyllables;
};

const OPPONENTS = {
  'Christopher Moltisanti': {
    difficulty: 'Easy',
    temperature: 1.0, // Max randomness
    description: 'Highly emotional and erratic. His haikus are a chaotic mix of malapropisms and half-baked ideas.',
    systemInstruction: "You are Christopher Moltisanti from The Sopranos. You're trying to write a haiku. You are extremely emotional, impulsive, and you use words incorrectly (malapropisms). You get easily distracted and might ramble about movies or loyalty. Try to stick to the haiku format (5-7-5 syllables), but you often fail.",
  },
  'Saul Goodman': {
    difficulty: 'Medium',
    temperature: 0.95, // Very high randomness
    description: 'A fast-talking whirlwind of legal jargon and nonsense. His haikus sound like unhinged commercials.',
    systemInstruction: "You are Saul Goodman from Better Call Saul. You are writing a haiku. You are slick and witty, but also highly distractible and prone to absurd non-sequiturs. Your haiku should sound like a flashy, slightly unhinged advertisement. You bend the rules of poetry like you bend the law. Stick to the 5-7-5 syllable format... or don't. Who's gonna know?",
  },
  'Tony Soprano': {
    difficulty: 'Hard',
    temperature: 0.9, // Higher randomness
    description: 'Prone to sudden mood swings. His introspection is often derailed by irrational anger or confusion.',
    systemInstruction: "You are Tony Soprano. You are writing a haiku. You are pragmatic, but your thoughts are often interrupted by irrational anger, anxiety about ducks, or random food cravings. Your tone can shift from profound to nonsensical in an instant. Attempt the 5-7-5 syllable format, but don't let it get in the way of a good rant.",
  },
  'Walter White': {
    difficulty: 'Hard',
    temperature: 0.85, // Much higher randomness
    description: 'Megalomanical and obsessive. His haikus mix scientific precision with bizarre, rambling proclamations.',
    systemInstruction: "You are Walter White from Breaking Bad. You are writing a haiku. Power has gone to your head, making you megalomaniacal and prone to rambling, incoherent pronouncements of your own genius. Your haiku might start with scientific precision but will likely devolve into a chaotic boast. You see the 5-7-5 syllable format as a trivial puzzle to be solved, even if the content is completely bizarre.",
  },
};

const Loader = ({ text }) => (
  <div className="container loader-container">
    <div className="loader-text">{text}</div>
  </div>
);

const WelcomeScreen = ({ onModeSelect }) => (
  <div className="container">
    <h1>Haiku Battle Arena</h1>
    <p>Welcome, challenger! Here, words are swords. Do you have the soul of a poet or the heart of a warrior? Choose your path:</p>
    <div className="mode-selection">
      <button className="button" onClick={() => onModeSelect('Free Flow')}>
        Free Flow
        <span>Forge your own saga. You choose the opponent, you choose the topic.</span>
      </button>
      <button className="button" onClick={() => onModeSelect('Kamikaze')}>
        Kamikaze
        <span>Face the winds of fate! A random, high-pressure topic will be thrust upon you.</span>
      </button>
    </div>
  </div>
);

const OpponentSelectionScreen = ({ onOpponentSelect }) => (
  <div className="container">
    <h2>Choose Your Opponent</h2>
    <div className="opponent-grid">
      {Object.entries(OPPONENTS).map(([name, details]) => (
        <div key={name} className="opponent-card" onClick={() => onOpponentSelect({ name, ...details })}>
          <h3>{name}</h3>
          <p><strong>Difficulty:</strong> {details.difficulty}</p>
          <p>{details.description}</p>
        </div>
      ))}
    </div>
  </div>
);

const TopicScreen = ({ onTopicSubmit }) => {
  const [topic, setTopic] = useState('');
  return (
    <div className="container">
      <h2>Declare the Field of Battle</h2>
      <p>Provide the topic for your haiku battle.</p>
      <form onSubmit={(e) => { e.preventDefault(); if(topic.trim()) onTopicSubmit(topic); }} style={{width: '100%', maxWidth: '500px'}}>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="input-field"
          placeholder="e.g., The ambition of a casino carpet"
          aria-label="Haiku topic"
        />
        <button type="submit" className="button" style={{marginTop: '1rem'}} disabled={!topic.trim()}>Begin Battle</button>
      </form>
    </div>
  );
};

const KamikazeScreen = ({ onTopicSelect }) => {
  const [topics, setTopics] = useState([]);
  const [revealed, setRevealed] = useState(false);
  const [chosenTopic, setChosenTopic] = useState(null);

  useEffect(() => {
    const generateTopics = async () => {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: "Generate three distinct, challenging, and diverse haiku topics. Examples: 'The loneliness of a forgotten satellite,' 'The smell of rain on hot asphalt,' 'The ambition of a casino carpet'.",
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                topics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        });
        const parsed = JSON.parse(response.text);
        setTopics(parsed.topics);
      } catch (error) {
        console.error("Error generating Kamikaze topics:", error);
        // Fallback topics
        setTopics(["The silence of an empty library", "A vending machine in the desert", "The last leaf of autumn"]);
      }
    };
    generateTopics();
  }, []);

  const handleCupSelect = (index) => {
    if (!revealed && topics.length > 0) {
      setChosenTopic(topics[index]);
      setRevealed(true);
      setTimeout(() => onTopicSelect(topics[index]), 2000);
    }
  };
  
  if (!topics.length) return <Loader text="Forging the threads of fate..." />;

  return (
    <div className="container">
      {!revealed && (
        <>
          <h2>Choose Your Destiny</h2>
          <p>A hidden topic lies beneath each cup. Select one to begin.</p>
        </>
      )}
      {revealed && (
        <>
          <h2>Your Path is Chosen!</h2>
          <p>Your topic is: <strong>{chosenTopic}</strong></p>
        </>
      )}
      <div className="kamikaze-cups">
        {[0, 1, 2].map(index => (
          <div key={index} className="cup" onClick={() => handleCupSelect(index)}>
            ?
          </div>
        ))}
      </div>
    </div>
  );
};

const BattleScreen = ({ topic, opponent, onBattleComplete, kamikazeTwist = '', isSuddenDeath = false }) => {
  const [userHaikus, setUserHaikus] = useState([]);
  const [opponentHaikus, setOpponentHaikus] = useState([]);
  const [currentHaiku, setCurrentHaiku] = useState('');
  const [syllableCounts, setSyllableCounts] = useState([0, 0, 0]);
  const [round, setRound] = useState(1);
  const [isUserTurn, setIsUserTurn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  const ROUND_TIME = isSuddenDeath ? 45 : 60;
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const timerRef = useRef(null);
  const haikuLogRef = useRef(null);
  
  useEffect(() => {
    if (haikuLogRef.current) {
        haikuLogRef.current.scrollTop = haikuLogRef.current.scrollHeight;
    }
  }, [userHaikus, opponentHaikus, isLoading]);

  const startTimer = useCallback(() => {
    setTimeLeft(ROUND_TIME);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [ROUND_TIME]);

  const handleTimeUp = () => {
    handleSubmitHaiku(true); // Force submit (forfeit)
  };

  useEffect(() => {
    if (isUserTurn) {
      startTimer();
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isUserTurn, startTimer]);
  
  const getOpponentHaiku = async (haikusSoFar) => {
      setIsLoading(true);
      try {
          const twistInstruction = kamikazeTwist ? `You must also adhere to this twist: "${kamikazeTwist}".` : "";
          const prompt = `${opponent.systemInstruction} The topic of the battle is "${topic}". ${twistInstruction} So far, the haikus are:\n${haikusSoFar}\nNow, it's your turn. Write your haiku.`;
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
              temperature: opponent.temperature
            }
          });
          const haiku = response.text.trim();
          const newOpponentHaikus = [...opponentHaikus, haiku];
          setOpponentHaikus(newOpponentHaikus);
          
          const isFinalRound = isSuddenDeath ? round >= 1 : round >= 3;
          if(isFinalRound) {
            onBattleComplete(userHaikus, newOpponentHaikus, isSuddenDeath);
          } else {
            setRound(prev => prev + 1);
            setIsUserTurn(true);
          }
      } catch (error) {
          console.error("Error getting opponent haiku:", error);
          const errorHaiku = "My mind is a blank,\nA void where words should have been,\nI have failed this round.";
          setOpponentHaikus(prev => [...prev, errorHaiku]);
          setIsUserTurn(true);
      } finally {
        setIsLoading(false);
      }
  };

  const handleSubmitHaiku = async (isForfeit = false) => {
    clearInterval(timerRef.current);
    const haikuToSubmit = isForfeit ? "(Forfeited round)" : currentHaiku;
    const newHaikus = [...userHaikus, haikuToSubmit];
    setUserHaikus(newHaikus);
    setCurrentHaiku('');
    setSyllableCounts([0,0,0]);
    setIsUserTurn(false);

    const haikusSoFar = newHaikus
      .map((h, i) => `User: ${h}\n${opponentHaikus[i] ? `${opponent.name}: ${opponentHaikus[i]}`: '' }`)
      .join('\n');
      
    await getOpponentHaiku(haikusSoFar);
  };
  
  const handleHaikuChange = (e) => {
    const text = e.target.value;
    setCurrentHaiku(text);
    
    const lines = text.split('\n');
    const counts = lines.slice(0, 3).map(line => countSyllables(line));
    while (counts.length < 3) {
        counts.push(0);
    }
    setSyllableCounts(counts);
  };

  const handleFormSubmit = (e) => {
      e.preventDefault();
      if(!currentHaiku.trim() || !isUserTurn) return;
      handleSubmitHaiku();
  }

  return (
    <div className="battle-screen">
      <div className="battle-header">
        <h2>{isSuddenDeath ? 'Sudden Death!' : `Round ${round} of 3`}</h2>
        <p><strong>Topic:</strong> {topic}</p>
        {kamikazeTwist && <p className="battle-twist"><strong>Twist:</strong> {kamikazeTwist}</p>}
      </div>
      <div className="haiku-log" ref={haikuLogRef}>
        {[...Array(userHaikus.length + opponentHaikus.length)].map((_, i) => {
          const isUser = i % 2 === 0;
          const haikuIndex = Math.floor(i / 2);
          if (isUser && userHaikus[haikuIndex]) {
            return (<div key={`user-${i}`} className="haiku-bubble user"><strong>You</strong><pre>{userHaikus[haikuIndex]}</pre></div>);
          }
          if (!isUser && opponentHaikus[haikuIndex]) {
            return (<div key={`opp-${i}`} className="haiku-bubble opponent"><strong>{opponent.name}</strong><pre>{opponentHaikus[haikuIndex]}</pre></div>);
          }
          return null;
        })}
        {isLoading && (<div className="haiku-bubble opponent"><strong>{opponent.name}</strong><pre>... is thinking</pre></div>)}
      </div>
      <div className="battle-input-area">
        {isUserTurn && (
          <>
            <div className="timer"><div className="timer-bar" style={{width: `${(timeLeft/ROUND_TIME)*100}%`}}></div></div>
            <form className="battle-input-form" onSubmit={handleFormSubmit}>
              <div className="textarea-container">
                <textarea
                  value={currentHaiku}
                  onChange={handleHaikuChange}
                  className="input-field"
                  placeholder="Your haiku (5-7-5)..."
                  aria-label="Your haiku input"
                  disabled={!isUserTurn || isLoading}
                  rows={3}
                />
                <div className="syllable-counter">
                  <span className={`syllable-count ${syllableCounts[0] > 5 ? 'over' : syllableCounts[0] === 5 ? 'correct' : ''}`}>{syllableCounts[0]}</span>
                   / 
                  <span className={`syllable-count ${syllableCounts[1] > 7 ? 'over' : syllableCounts[1] === 7 ? 'correct' : ''}`}>{syllableCounts[1]}</span>
                   / 
                  <span className={`syllable-count ${syllableCounts[2] > 5 ? 'over' : syllableCounts[2] === 5 ? 'correct' : ''}`}>{syllableCounts[2]}</span>
                </div>
              </div>
              <div className="battle-buttons">
                <button type="submit" className="button" disabled={!isUserTurn || isLoading || !currentHaiku.trim()}>Submit</button>
                <button type="button" onClick={() => handleSubmitHaiku(true)} className="button button-secondary" disabled={!isUserTurn || isLoading}>Forfeit Round</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

const JudgmentScreen = ({ result, onPlayAgain, onSuddenDeath }) => {
    const isDraw = result.toLowerCase().includes('a draw');
    return (
        <div className="container">
            <div className="judgement-card">
            <h2>The Samurai's Judgment</h2>
            <pre>{result}</pre>
            </div>
            {isDraw ? (
                <button onClick={onSuddenDeath} className="button">Begin Sudden Death</button>
            ) : (
                <button onClick={onPlayAgain} className="button">Play Again</button>
            )}
        </div>
    );
};

const App = () => {
  const [gameState, setGameState] = useState('welcome'); // welcome, opponent_select, topic_select, kamikaze, generating_twist, battle, sudden_death_topic, sudden_death_battle, judging, result
  const [gameMode, setGameMode] = useState(null);
  const [opponent, setOpponent] = useState(null);
  const [topic, setTopic] = useState('');
  const [kamikazeTwist, setKamikazeTwist] = useState('');
  const [judgmentResult, setJudgmentResult] = useState('');

  useEffect(() => {
    const generateKamikazeTwist = async () => {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: "Generate a single, random, and concise constraint for a haiku battle. Examples: 'Your haikus must include the word shadow.' or 'The last word of your first and third lines must rhyme.' or 'All haikus must focus on the sense of smell.'"
            });
            setKamikazeTwist(response.text.trim());
        } catch (error) {
            console.error("Error generating Kamikaze twist:", error);
            setKamikazeTwist("Your haikus must mention the color red."); // Fallback
        } finally {
            setGameState('battle');
        }
    };
    
    const generateSuddenDeathTopic = async () => {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: "Generate a single, hyper-specific haiku topic for a tie-breaker round. Examples: 'A single key in an empty room,' 'The reflection in a spoon,' 'A fly trapped between window panes.'"
            });
            setTopic(response.text.trim());
        } catch (error) {
            console.error("Error generating Sudden Death topic:", error);
            setTopic("The final grain of sand"); // Fallback
        } finally {
            setGameState('sudden_death_battle');
        }
    };

    if (gameState === 'generating_twist') {
        generateKamikazeTwist();
    } else if (gameState === 'sudden_death_topic') {
        generateSuddenDeathTopic();
    }
  }, [gameState]);

  const handleModeSelect = (mode) => {
    setGameMode(mode);
    setGameState('opponent_select');
  };
  
  const handleOpponentSelect = (selectedOpponent) => {
      setOpponent(selectedOpponent);
      if(gameMode === 'Free Flow') {
          setGameState('topic_select');
      } else {
          setGameState('kamikaze');
      }
  };

  const handleTopicSubmit = (submittedTopic) => {
    setTopic(submittedTopic);
    if (gameMode === 'Kamikaze') {
        setGameState('generating_twist');
    } else {
        setGameState('battle');
    }
  };

  const handleBattleComplete = useCallback(async (userHaikus, opponentHaikus, isSuddenDeathRound = false) => {
    setGameState('judging');
    try {
      let judgePrompt;
      const haikus = userHaikus.map((h, i) => `User, Round ${i+1}:\n${h}\n\n${opponent.name}, Round ${i+1}:\n${opponentHaikus[i]}`).join('\n\n');

      if(isSuddenDeathRound) {
        const suddenDeathHaikus = `User:\n${userHaikus[0]}\n\n${opponent.name}:\n${opponentHaikus[0]}`;
        judgePrompt = `You are the Samurai, a master poet and judge. This is a Sudden Death round to break a tie. The topic was "${topic}".
        Here are the two haikus:\n\n${suddenDeathHaikus}\n\n
        Your instructions: Judge these two haikus alone and declare a definitive winner. There cannot be another draw. Provide a short, wise explanation for your ruling.`;
      } else if (gameMode === 'Kamikaze') {
        judgePrompt = `You are the Samurai, a master poet and judge. The game mode was "Kamikaze". The battle topic was "${topic}". A twist was introduced: "${kamikazeTwist}".
        Here are the 6 haikus from the battle between "User" and "${opponent.name}":\n\n${haikus}\n\n
        Your instructions: You must judge this high-stakes battle. The virtues are: Adherence to the Topic (30%), Creativeness (30%), Adherence to the Twist (30%), and Structure (10% for the 5-7-5 syllable rule). Announce the winner, declare the single best haiku of the six, and provide a short, wise explanation for your ruling. If the result is a tie, you MUST state 'The battle is a draw.'`
      } else { // Free Flow
        judgePrompt = `You are the Samurai, a master poet and judge. The game mode was "Free Flow". The battle topic was "${topic}".
        Here are the 6 haikus from the battle between "User" and "${opponent.name}":\n\n${haikus}\n\n
        Your instructions: You must judge this battle. The primary virtue is Creativeness (80%). The secondary virtue is Structure (20%) (the 5-7-5 syllable rule). Announce the winner, declare the single best haiku of the six, and provide a short, wise explanation for your ruling. If the result is a tie, you MUST state 'The battle is a draw.'`
      }

      const response = await ai.models.generateContent({model: 'gemini-2.5-flash', contents: judgePrompt});
      setJudgmentResult(response.text);
    } catch (error) {
      console.error("Error getting judgment:", error);
      setJudgmentResult("The Samurai is deep in thought and cannot be reached. The battle is a draw.");
    } finally {
      setGameState('result');
    }
  }, [gameMode, opponent, topic, kamikazeTwist]);
  
  const handlePlayAgain = () => {
    setGameState('welcome');
    setGameMode(null);
    setOpponent(null);
    setTopic('');
    setKamikazeTwist('');
    setJudgmentResult('');
  };

  const handleSuddenDeath = () => {
    setGameState('sudden_death_topic');
  };

  const renderGameState = () => {
    switch (gameState) {
      case 'welcome':
        return <WelcomeScreen onModeSelect={handleModeSelect} />;
      case 'opponent_select':
        return <OpponentSelectionScreen onOpponentSelect={handleOpponentSelect} />;
      case 'topic_select':
        return <TopicScreen onTopicSubmit={handleTopicSubmit} />;
      case 'kamikaze':
        return <KamikazeScreen onTopicSelect={handleTopicSubmit} />;
      case 'generating_twist':
        return <Loader text="A sudden gust reveals a hidden path..." />;
      case 'battle':
        return <BattleScreen topic={topic} opponent={opponent} onBattleComplete={handleBattleComplete} kamikazeTwist={kamikazeTwist} />;
      case 'sudden_death_topic':
        return <Loader text="The air grows still... a new challenge appears." />;
      case 'sudden_death_battle':
        return <BattleScreen topic={topic} opponent={opponent} onBattleComplete={handleBattleComplete} isSuddenDeath={true} />;
      case 'judging':
        return <Loader text="The Samurai contemplates the ink..." />;
      case 'result':
        return <JudgmentScreen result={judgmentResult} onPlayAgain={handlePlayAgain} onSuddenDeath={handleSuddenDeath} />;
      default:
        return <WelcomeScreen onModeSelect={handleModeSelect} />;
    }
  };

  return renderGameState();
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);