# **Natively Adaptive Interfaces (NAI)**

**Code:** [https://github.com/paradigms-of-intelligence/ai-for-accessibility](https://github.com/paradigms-of-intelligence/ai-for-accessibility)
**Team:** Google (Anoop Sinha, Liz Jenkins, Shruti Sheth, Shaun Kane, Philip Nelson, Renelito Delos Santos, Sam Sepah, Alexander Hauerslev Jensen)
**Contact:** Anoop Sinha, [anoop.k.sinha@gmail.com](mailto:anoop.k.sinha@gmail.com)

## **What it does**

This specific demo application creates a recipes web site with an adaptive multimodal agent that is able to help users navigate the web site. This is an example application with structured agents using Gemini, offered as inspiration for future agent architectures.

The vision of NAI is to embed multimodal AI agents directly into the application stack so digital experiences adapt in real-time to each user's accessibility needs — aiming to narrow the "accessibility gap" created by static designs where accessibility features are bolted on late.

## **Who it helps**

- [x] BLV (blind / low vision)
- [x] DHH (deaf / hard of hearing)
- [ ] Motor (limited mobility / tremor)
- [x] Cognitive and learning
- [ ] Speech (nonspeaking / non-standard speech)
- [ ] Older adults
- [ ] Other: \_\_\_

Note: the demo does not yet work with screen readers (see Limitations), so
BLV support is aspirational in the current version.

## **How it works**

**Input:** Pressing a shortkey triggers the agent.  The user can then ask the agent command by voice as well as set preferences such as text size, color, etc.

**Output:** The agent interprets the web site to the user's needs.  The commands are read back as captions.  The user's needs are adapted in the outputs.

**Modality transform:** Input can be voice input.  The output mostly this is text based that can be shown via text to speech or as captions.

**Module type:**

- [x] Transform: converts content across modalities
- [x] Analysis: detects issues or extracts information
- [ ] Memory: tracks user context across sessions
- [ ] Validation: human review of adaptations
- [x] Knowledge: contributes to the shared corpus
- [x] Other: Orchestrator (coordinates sub-agents)

## **Technical**

**Runs in web browser?** Yes

**If not, how could it be adapted for web?** N/A

**Latency:** \<2 seconds per command usually, since they are short commands

**Dependencies:** Gemini API Key

## **How it fits in the toolkit**

This is an example application with some inspiration and experiment on the future architecture.

It was built rapidly with AI assistance as an architecture probe. Its accessibility behavior has not been designed with or evaluated by disabled users; treat it as inspiration for agent structure, not as accessible-by-default output.

## **What it pairs with**

N/A

## **Limitations**

This is a custom site and example application.  It does not generalize yet.  And it does not handle mistakes, screen readers, etc. yet.

## **Human involvement**

The user gives input to what they need for accessibility. Disabled users
have not yet been involved in the design or evaluation of this demo.

## **Data & Privacy**

No storage in this application.

## **Demo *(optional)***

See code

## **Evaluation *(optional)***

None

## **What the team needs**

Looking for generalization of these concepts into the core architecture.
