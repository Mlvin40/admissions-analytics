package com.mvtech.bd2.features.search.service;

import com.mvtech.bd2.features.search.dto.SearchDtos.*;
import com.mvtech.bd2.features.search.repository.SearchRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.text.Normalizer;

@Service
public class SearchService {
    private final SearchRepository repository;
    public SearchService(SearchRepository repository) { this.repository = repository; }
    public ResultsPage search(Filter filter) {
        String key = null;
        if (filter.correlativo() != null && !filter.correlativo().isBlank()) {
            String id = Normalizer.normalize(filter.correlativo().strip(),Normalizer.Form.NFC);
            String scheme = filter.identityScheme() != null ? filter.identityScheme() : id.matches("[0-9a-f]{32}") ? "full32" : id.matches("[0-9a-f]{20,23}") ? "short" : "other";
            key = scheme+":"+id;
        } else if (filter.identityScheme() != null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"El esquema requiere correlativo completo");
        return repository.search(filter,key);
    }
    public OptionsPage options(LookupFilter filter) {
        if (filter.departmentKey() != null && !filter.dimension().equals("municipality"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"departmentKey solo corresponde a municipios");
        return repository.options(filter);
    }
}
