import { PrimitiveTrack, Track, QueueMutationCallback } from './uncomplicated-interfaces';
/**
 * Queue mechanism:
 * For going next we simply create a flow from next till prev, picking the
 * track from next depends on shuffle state. To go back we create a reverse
 * flow and since we are using an object for next tracks, it is guaranteed
 * that if the tracks were shuffled initially they will get back to original
 * position.
 *
 * current_track is object
 * next is map<key as string, track>
 * all others are arrays
 *
 * [history]{current_track}[next_seek]{{next}}
 *  ^     ^                 ^       ^
 * [0     n]               [0       m]
 *
 * next:
 *  1. history.push_back(current_track)
 *  2. next_seek.push_back(next.fetch_according_to_shuffle())
 *  3. current_track = next_seek.front
 *  4. next_seek.pop_front()
 *  5. next.remove_fetched_track()
 *
 * prev:
 *  1. next.insert(next_seek.back)
 *  2. next_seek.pop_back()
 *  3. next_seek.push_front(current_track)
 *  4. current_track = history.back
 *  5. history.pop_back()
 */
/**
 * Queue for the uncomplicated player.
 */
declare class UncomplicatedPlayerQueue {
    private queue;
    private shuffleQueue;
    private tracksKeyCounter;
    private seekSize;
    private queueMutationCallback;
    constructor();
    /**
     * Compares comp to original, checks recursively for all properties
     * and objects as values of properties in comp with original
     * @param {Object} original original object
     * @param {Object} comp object to compare
     * @returns {Boolean} true if match, false otherwise
     */
    private recursiveCompare;
    /**
     * Refreshes the queue. Check for errors and fixes them.
     */
    private refreshQueue;
    /**
     * Adds new track to the queue
     * @param {Track} track track to be added to the queue
     * @returns {number} key of added track
     */
    push(track: PrimitiveTrack): number;
    /**
     * Added multiple tracks to the crew and returns the array with tracks key
     * added to each Track object.
     * @param {Track[]} tracks tracks array to be added to the queue
     * @returns {Track[]} tracks array with respective key added to each track
     */
    pushMany(tracks: PrimitiveTrack[]): Track[];
    /**
     * Adds a track next up instead of queue end.
     * @param {PrimitiveTrack} track track to be added next
     * @returns {number} key of added track
     */
    addNext(track: PrimitiveTrack): number;
    /**
     * Removes the last track from the queue. Removes present track if it is
     * the last track.
     * @returns key of the removed track, if no track exists then -1
     */
    pop(): number;
    /**
     * Compares values in search with corresponding values in the tracks
     * of the queue. All the matches are removed.
     * @param {Object} search Object with values which should be compared.
     * @returns array of the keys of tracks removed
     */
    remove(search: {
        key?: number;
        src?: URL;
        data?: Object;
    }): number[];
    /**
     * Clears the queue including now playing.
     */
    clear(): void;
    /**
     * Advances the playlist.
     * @returns {Track} the new current track, null if no next track
     */
    next(): Track | null;
    /**
     * Checks if there are more tracks ahead.
     * @returns {boolean} true if no next tracks available
     */
    get isNextEmpty(): boolean;
    /**
     * Retreats the playlist.
     * @returns {Track} the new current track if exists, otherwise null
     */
    prev(): Track | null;
    /**
     * Checks if there are more tracks behind.
     * @returns {boolean} true if no previous available
     */
    get isPrevEmpty(): boolean;
    /**
     * Brings queue to start.
     */
    reset(): void;
    /**
     * Gets the current track data. Null if no current track is available to be
     * set to current.
     */
    get current(): Track | null;
    /**
     * Get size of seek array.
     */
    get seekLength(): number;
    /**
     * Set size of seek array.
     */
    set seekLength(len: number);
    /**
     * Get the next and previous seeks.
     * [...............]       [...........]
     *  0.............n         0.........n
     *        prev                  next
     *  oldest...recent         next...last
     */
    get seek(): {
        next: Track[];
        prev: Track[];
    };
    /**
     * Sets seek length to default. Default is 3.
     */
    setDefaultSeekLength(): void;
    /**
     * Gets the playlist shuffle enabled/disabled state.
     */
    get shuffle(): boolean;
    /**
     * Sets the playlist shuffle enabled/disabled state. Refreshes next seek
     * if state changed.
     */
    set shuffle(shuffleEnable: boolean);
    /**
     * Sets mutation callback replacing the previous one. End-developer should
     * avoid using this setter.
     */
    set _mutationCallback(newMutationCallback: QueueMutationCallback);
}
export default UncomplicatedPlayerQueue;
