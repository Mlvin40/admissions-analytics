package com.mvtech.bd2.features.status.dto;

public record StatusResponse(State api, State mongodb, State neo4j) {

    public enum State { UP, DOWN, NOT_CHECKED }

    public boolean available() {
        return api == State.UP && mongodb != State.DOWN && neo4j != State.DOWN;
    }
}
